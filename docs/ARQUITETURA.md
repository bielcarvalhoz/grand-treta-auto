# Arquitetura — módulos para trabalhar em paralelo

O código é dividido em **módulos independentes**, um por pasta em `src/`. Cada módulo tem uma
**API pública** no seu `index.js`; o resto da pasta é interno e pode mudar à vontade sem
quebrar o trabalho de quem cuida de outro módulo.

## Módulos

| Pasta | Módulo | Responsabilidade | Exemplos de tarefa |
|---|---|---|---|
| `src/core/` | Núcleo / motor | renderer, cena, câmera, céu, luz e sombra, laço de sistemas, eventos, atalhos de teclado, física compartilhada, espaço de treino, visual cartoon/pixel, perfil gráfico, câmera de tour, configurações persistentes, lotes de instâncias, áudio procedural | pós-processamento, ciclo dia/noite, otimização de desempenho |
| `src/map/` | Mapa (mundo real) | relevo SRTM, vias, prédios do OSM, prédios procedurais, vegetação, água, muros, semáforos, placas, destinos do entorno | melhorar ruas, novos tipos de prédio, mais vegetação |
| `src/campus/` | Campus Cidade de Deus | núcleo do Bradesco: prédios da planta oficial, muros, portarias, estacionamentos, terraplenagem, detalhes, marcos levantados em campo (`landmarks.js`: escadaria, beco, acessos, locomotiva) | novo prédio, fachada, mobiliário do campus |
| `src/player/` | Personagem | avatar Sato, animações e encaixe de armas; controle em primeira/terceira pessoa, teclado, mouse, toque, colisão, pulo, voo | modelo/avatar, animação, corrida, agachar |
| `src/gameplay/<mecânica>/` | Jogabilidade | `paintball/`: catálogo, inventário, armas de fogo, melee, socos e armas no chão | missões, carros, coletáveis, multiplayer |
| `src/ui/` | Interface | tela de carregamento, menu, HUD, minimapa, mapa grande, avisos, gestos mobile, CSS | novas telas, configurações, acessibilidade |
| `src/debug/` | Depuração | `window.__cdd`, vistas de inspeção `?inspect=` | ferramentas de QA |
| `src/shared/` | Utilitários | funções puras: geometria 2D, aleatoriedade, geometria de vias, texturas procedurais, download de JSON com parsing adiado | — |
| `scripts/` | Dados | baixar OSM/SRTM (`npm run data`), gerar o campus (`npm run campus`), verificar módulos | — |
| `tests/<módulo>/` | Testes | testes de cada módulo (`node --test`) | — |

## Como as peças se conectam

`src/main.js` só **monta** o jogo, nesta ordem:

```
menu + intro + downloads → fim da intro apresentado → JSON (map + campus) → core (game) → mapa (+ plugin campus) → lotes → treino → caixas/Rapier → personagem + GLB pronto → tour → combate/BVH + modelos → armas no chão → UI → visual → materiais → debug → menu pronto
```

`createFrontMenu()` expõe `introFinished`, que resolve após a abertura (ou pular/configurações/movimento reduzido) e dois `requestAnimationFrame`, garantindo que a capa final seja apresentada antes do trabalho pesado. `loadMapData(base, { beforeParse })` e `loadCampusData(base, { beforeParse })` baixam o corpo durante a intro e aguardam essa promessa antes de fazer JSON.parse. `main.js` também aguarda explicitamente antes de criar WebGL/PMREM e montar o mundo. Animações CSS não protegem o texto de tarefas longas na thread principal. Depois de carregar, o motor mantém sistemas leves a 15 Hz no menu opaco e pula o desenho da cidade oculta; a renderização normal volta ao iniciar campanha/tour.

Tudo gira em torno de um objeto **`game`** (criado em `core/game.js`), o único compartilhado:

O personagem expõe `bindFireButton(element, onHeld)`, `setFocusedAim(bool)` e `jump()`.
`ready` resolve quando o GLB de Sato está carregado; o bootstrap aguarda essa promessa
antes de criar o paintball e registrar os materiais. `setCameraMode('first' | 'third')`
e `toggleCameraMode()` alternam a vista e emitem `cameramode` em `player.events`.
`eyePosition`, `velocity`, `grounded` e `cameraMode` descrevem o estado do jogador.
`getShotOrigin(target)` escreve em `target` a posição dos olhos, independente da
posição da câmera em terceira pessoa. `updateWeapon(gun, state)` posiciona a arma
no mundo pelo encaixe da mão direita; retorna se a pose foi aplicada.
O módulo de paintball conecta o gatilho/mira ao personagem por essa API e expõe
`setTrigger(bool)`, `setWeapon(id)`, `setAiming(bool)`, `resetInput()` e `clearEffects()`; a UI usa o
personagem para pulo e voo. `getCameraMode()` permite distinguir a mira comum da AWP
do escopo em primeira pessoa: `scoped`, `scopeZoom` e `adjustScopeZoom(delta)`
controlam a ampliação de 2× a 8×. O FOV usa a relação angular da magnificação;
`updateWeapon(gun, state)` recebe `scoped` para ocultar os braços enquanto o
encaixe da arma continua atualizado para disparos e colisões. Não há imports novos entre módulos.

`weapons.js` mantém o catálogo e a regra de dois slots de fogo, um melee e socos
sempre disponíveis. `paintball.inventory` retorna `{slots, selected, lastFirearmSlot}`;
`availableWeapons` contém os três equipamentos e socos. `pickupWeapon(id)` retorna
`{picked, dropped, slot}`; armas de fogo substituem o slot de fogo selecionado ou o
último usado, e melee substitui apenas o slot 3. `pickups.js` cria as cópias no chão,
detecta proximidade e coloca o item descartado no lugar do coletado. A UI usa
`game.weaponPickups.nearby` e `pickup()`, e implementa a roda por segurar/arrastar/soltar
em `ui/weapon-wheel.js`. `game.ui.weaponWheelOpen` bloqueia tiros e mira durante a escolha.
Os slots aparecem somente na roda enquanto o botão está pressionado; não há
inventário permanente no HUD.

`player/avatar.js` mantém um único modelo, esqueleto e materiais para as duas vistas.
Na primeira pessoa oculta cabeça, tronco e pernas, e gira o rig em torno dos olhos;
na terceira mantém o corpo em pé. A locomoção anima quadril/pernas enquanto as
poses originais de pistola animam tronco, braços, punhos e dedos. `playShot(strength = 1)`
aplica o recuo do clipe original de disparo sobre a pose de mira atual; a Nova usa
maior amplitude e recuperação mais lenta. A arma acompanha a mão direita, e a primeira
pessoa enquadra o conjunto de braços/arma sem reescrever rotações das articulações.
Clipes preservados no GLB podem ser inspecionados com
`avatar.setPreviewAnimation(name, time)`; a presença de `Pistol_Reload` no arquivo
não representa uma mecânica de recarga no jogo. `public/models/sato.glb` é uma cópia
sem alterações do `sato (4).glb` fornecido pelo usuário. A orientação dos punhos e
a articulação dos dedos vêm da pose de pistola original, sem reescrever o asset.

`gameplay/paintball/weapon-models.js` carrega os GLBs Quaternius antes da coleta
de materiais e do warmup. Normaliza escala/eixo e fornece empunhadura e cano para
`setWeaponModels()`. A seleção da tinta atualiza só os detalhes das armas;
`keepStandard` preserva seus materiais e o filtro localizado no modo cartoon.
Na primeira pessoa os ombros ficam atrás do plano próximo da câmera, e o recuo
aditivo tem peso reduzido para manter o retículo visível. A mira enquadra cada
perfil de arma abaixo do retículo. `ui/sniper-scope.js` desenha a abertura circular
e o retículo da AWP sem exibir arma ou braços. Durante o escopo, o scroll ajusta
a ampliação; fora dele, seleciona primeira pessoa para cima e terceira para baixo,
sem interferir no mapa/tour. No toque, botões +/− também ajustam o zoom.

A postura de mira compensa a rotação do quadril na primeira vértebra e acrescenta
um balanço sutil durante a corrida, movendo a cadeia inteira de braços.
A intensidade do analógico escolhe continuamente caminhada, trote ou corrida em
qualquer direção. `Walk_Loop`, `Jog_Fwd_Loop` e `Sprint_Loop` acompanham a velocidade
real e a fase compartilhada `player.locomotion`. Eventos `footstep`, `jump` e `land`
disparam sons de grama/concreto por `core/locomotion-audio.js`, sem passos parado,
contra obstáculos ou durante o voo. `avatar.playAttack(def, {sequence})` usa
`Sword_Attack` para melee e alterna `Punch_Jab`/`Punch_Cross` para socos.
Na primeira pessoa, melee usa a guarda frontal original de pistola como base
e o movimento aditivo dos braços de espada, com amplitude reduzida e ombros
fora do enquadramento. A guarda fica mais à direita/abaixo, com braços e arma
reduzidos juntos nessa vista; todas as lâminas e cabos inclinam para frente.
A terceira pessoa conserva a pose e o golpe de espada completos.
`player/hair.js` joga pontas e franja para a esquerda do personagem (+X no GLB),
preservando a nuca e o asset original. A classe `body.playing`, vinculada a lock/unlock do jogador,
oculta o cursor no jogo e restaura o cursor ao abrir menus/mapa.

`core/training.js` expõe `start()`, `stop()`, `active`, `floor`, `terrain`, `bounds`
e consultas de colisão/pisos/telhados compatíveis com as usadas pelo personagem.
O modo `training` oculta a cidade e usa uma área plana isolada; `player/index.js`
seleciona essas consultas enquanto o treino está ativo e desativa o voo. A saída
restaura visibilidade, atmosfera, câmera e posição anteriores. A UI emite
`modechange` ao entrar ou sair dos modos; paintball limpa gatilho, mira, projéteis
e marcas de tinta. Durante o treino, seus raios consultam o piso e a caixa ativa.

`core/dynamic-props.js` inicializa Rapier por importação assíncrona e cria duas caixas
de madeira, uma por espaço. O mundo usa passo fixo de 1/60 s, piso de treino e uma
malha amostrada do terreno do campo; só a caixa do espaço ativo participa. O personagem
compõe consultas de colisão e topo da caixa com os pisos existentes. `onImpact(hit, info)`
aplica impulso no ponto atingido e registra dano; marcas de tinta acompanham a caixa.
Golpes de melee e socos usam um alcance curto a partir dos olhos e nunca criam tinta.

| Campo | O que é | Quem preenche / usa |
|---|---|---|
| `game.audio` | música, UI, tiros, passos, pulo/pouso e golpes: AudioContext criado no primeiro gesto, vozes limitadas | menu cria antes dos dados; core compartilha; UI e paintball usam |
| `game.engine` | `scene`, `camera`, `renderer`, `sun`, `addSystem(fn, fase)`, `setShadowFocus(fn)` | core; todos usam |
| `game.physics` | obstáculos, pisos e telhados (`addCollider`, `addSurface`, `addRoof`) e consultas (`collide`, `surfaceHeightAt`, `roofAt`) | mapa e campus **registram**; personagem **consulta** |
| `game.training` | espaço quadriculado isolado e consultas físicas próprias; restaura o estado da cidade ao sair | core cria antes do avatar; UI inicia/encerra; player e paintball consultam |
| `game.dynamicProps` | caixas Rapier, `root`, `impact`, consultas de colisão/topo | core cria antes do avatar; player e paintball usam |
| `game.weaponPickups` | armas no chão, `nearby`, `pickup` e reposição do item descartado | gameplay cria antes da UI |
| `game.mode`, `game.tour`, `game.mapPoints`, `game.settings` | modo ativo, câmera independente, destinos numerados e escolhas persistentes | main, core, campus, UI |
| `game.places` | destinos de teletransporte `{ name, x, z, yaw }` | campus e mapa adicionam; UI e personagem leem |
| `game.input` | `bind('KeyP', fn, { when: 'playing' \| 'always', label })` | cada módulo registra as próprias teclas |
| `game.events` | `on(nome, fn)` / `emit(nome, dados)` | comunicação sem import |
| `game.toast(msg)` | aviso rápido na tela (evento `'toast'`) | qualquer módulo; a UI mostra |
| `game.status(msg, progresso)` | mensagem e percentual ponderado da etapa de carregamento | etapas de construção |
| `game.map`, `game.campus`, `game.player`, `game.paintball`, `game.ui`, `game.styler` | as APIs de cada módulo | preenchidos pelo `main.js` |

### Laço do jogo (fases)

`engine.addSystem(fn, fase)` roda `fn(dt, t)` todo quadro. As fases rodam nesta ordem:

1. `early` — antes de tudo (ex.: vento da vegetação)
2. `player` — movimento, câmera, locomoção e atualização do avatar
3. `world` — objetos do mundo (semáforos, cancelas, tinta, placas); paintball encaixa a arma na mão após animar o avatar
4. `late` — interface (HUD)

Depois o motor move o céu, centra a sombra no personagem e desenha.

### Mapa com plugins

O mapa é construído por um pipeline. Quem precisa alterar o mundo (como o campus) entra como
**plugin**, implementando só os ganchos de que precisa, na ordem em que rodam:

| Gancho | Quando roda | Uso no campus |
|---|---|---|
| `prepareWorld(map)` | logo após ler o GeoJSON | troca os prédios do OSM pela planta oficial; `map.reserve(área)` |
| `correctTerrain(map)` | antes de escavar a água | corrige o relevo de satélite com os pontos de controle altimétrico |
| `shapeTerrain(map)` | após escavar a água, antes da malha do relevo | terraplenagem (pista, prédios, acessos) |
| `detailGroundRect(map)` | ao pintar o chão | chão em alta resolução sobre o campus |
| `build(map)` | após vias e prédios do OSM | constrói prédios, muros, portarias, carros |
| `decorate(map)` | após a vegetação | gramado do campus |
| `finalize(map)` | no fim | registra física, portarias em `game.places`, placas, sistema de animação |

Áreas reservadas com `map.reserve(...)` não recebem prédios procedurais nem vegetação automática.

## Regras (verificadas automaticamente por `npm test`)

1. **Importe outro módulo só pelo `index.js` dele.** Nada de `../map/terrain.js` fora de `map/`.
   `shared/` é a exceção (pode ser importado direto).
2. **Só valem as dependências da tabela abaixo.** O personagem não conhece o mapa por dentro:
   ele usa `game.physics`. A UI não importa o personagem: usa `game.player`.

| Módulo | Pode importar |
|---|---|
| `shared` | — |
| `core` | `shared` |
| `map` | `core`, `shared` |
| `campus` | `map`, `core`, `shared` |
| `player` | `core`, `shared` |
| `gameplay/*` | `player`, `map`, `core`, `shared` |
| `ui` | `core`, `shared` |
| `debug` | todos |
| `main.js` | todos (só os `index.js`) |

Precisa de uma dependência nova? Altere a tabela `DEPENDENCIAS` em
`scripts/check-modules.mjs` **e** esta página no mesmo PR, para a mudança ficar visível na revisão.

3. Testes de um módulo ficam em `tests/<módulo>/` e podem importar o interior do módulo.
4. Mudou a API pública (`index.js`) de um módulo? Descreva no PR e peça revisão de quem usa.

## Fluxo de trabalho em equipe

- Uma branch por tarefa: `feat/<módulo>-<assunto>` (ex.: `feat/player-agachar`).
- Cada pessoa trabalha dentro da pasta do seu módulo; conflitos ficam raros.
- Pontos de contato que todos podem tocar, com cuidado e em mudanças pequenas:
  `src/main.js` (ordem de montagem), `index.html` (elementos da interface) e esta página.
- Antes de abrir o PR: `npm test` (fronteiras + testes) e `npm run build`.

## Receitas

**Nova mecânica (ex.: carros):** crie `src/gameplay/carros/index.js` exportando
`createCarrosModule(game)`. Dentro dele use `game.engine.addSystem(...)`, `game.input.bind(...)`,
`game.physics.collide(...)` e `game.toast(...)`. Monte em `src/main.js` (uma linha) e adicione
`'gameplay/carros'` à tabela `DEPENDENCIAS`.

**Nova área modelada à mão (ex.: outro bairro):** crie `src/<area>/index.js` com
`create<Area>Plugin(game, dados)` implementando os ganchos do mapa, e inclua o plugin em
`buildMap(game, { plugins: [campus, area] })`.

**Novo obstáculo ou piso:** registre em `game.physics` (`addCollider`, `addSurface`, `addRoof`).
O personagem passa a respeitá-lo sem mudança nenhuma em `src/player/`.

**Nova tecla:** `game.input.bind('KeyX', () => ..., { label: 'o que faz' })` no seu módulo.

**Aviso na tela:** `game.toast('mensagem')`.

## Responsáveis

Preencha com o time e espelhe em `.github/CODEOWNERS` para o GitHub pedir revisão automática.

| Módulo | Responsável |
|---|---|
| core | (definir) |
| map | (definir) |
| campus | (definir) |
| player | (definir) |
| gameplay | (definir) |
| ui | (definir) |

### Regressão da abertura no navegador

`scripts/qa-intro.cjs` requer Playwright e Chromium. Após `npm run build` e `npm run preview`, execute:

```bash
CHROMIUM_PATH=/usr/bin/chromium QA_CPU_RATE=4 node scripts/qa-intro.cjs http://localhost:4173/
```

Se o Chromium instalado pelo Playwright for usado, omita `CHROMIUM_PATH`. `QA_VIEWPORT=844x390` testa horizontal; o padrão é `390x844`. `QA_ARTIFACT_DIR` define onde salvar o relatório por quadro e a captura (padrão: diretório temporário `jogo-intro-qa`). O teste deixa downloads e construção 3D acontecerem normalmente, reduz a velocidade da CPU e verifica intervalos entre quadros, revelação progressiva antes do final, fundo estável, palavras sem quebra e WebGL após a abertura. Também confirma que os dados baixam durante a intro, que o menu opaco não redesenha a cidade e que a campanha volta a renderizar ao iniciar. A CPU retorna à velocidade normal para essas verificações após medir a abertura.
