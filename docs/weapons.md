# Armas, inventário e referência de Counter-Strike

Os modelos estilizados fornecidos pelo usuário foram comparados por classe e
silhueta. Os nomes abaixo são equivalentes aproximados de Counter-Strike;
os GLBs não são modelos oficiais de CS.

| Modelo local | Referência visual | Dano por projétil | Intervalo primário | Funcionamento |
| --- | --- | ---: | ---: | --- |
| Pistol | Glock-18 | 30 | 0,15 s | Semiautomática |
| Assault Rifle | M4A4 | 33 | 0,09 s | Automática |
| Revolver | R8 Revolver | 86 | 0,50 s | Toque ou segurar; preparação de 0,20 s |
| Shotgun | Nova | 26 | 0,88 s | Um cartucho com 9 projéteis; cone de dispersão |
| Sniper Rifle | AWP | 115 | 1,455 s | Tiro único; mira com FOV 40 e maior precisão |
| Submachine Gun | MP5-SD | 28 | 0,08 s | Automática |

Fonte primária dos valores: o arquivo `weapons.vdata` distribuído com CS2,
[preservado pelo SteamDatabase](https://github.com/SteamDatabase/GameTracking-CS2/blob/master/game/csgo/pak01_dir/scripts/weapons.vdata)
([conteúdo bruto](https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/weapons.vdata)).
Foi consultado em 11/10/2026. Os campos usados, a URL e o hash do arquivo
consultado estão em [data/cs2-weapon-reference.json](../data/cs2-weapon-reference.json).
O identificador interno `weapon_m4a1` corresponde aqui à M4A4; a variante
silenciada tem outro identificador no jogo de referência.

As correspondências visuais são uma interpretação das armas genéricas:
pistola com ferrolho reto, rifle com coronha e carregador tipo M4,
revólver de cano longo, espingarda com telha, rifle longo com luneta e SMG
com coronha retrátil. A MP5-SD serve de referência de funcionamento mesmo
com diferenças no silenciador do modelo fornecido.

## Adaptações ao jogo

O disparo continua usando bolinhas de tinta visíveis, gravidade e marcas na
superfície. A caixa recebe o dano de referência e um impulso proporcional;
as marcas acompanham sua posição e rotação. Não há alvos humanos, armadura,
penetração, multiplicadores de cabeça ou sistema de munição/recarga neste
protótipo. Modos alternativos de CS, como rajada da Glock e disparo secundário
do R8, não fazem parte dos controles atuais. O cone da Nova é uma distribuição
em disco; não reproduz o padrão proprietário de pellets de CS.

Um toque no R8 aceita um disparo e conclui os 0,20 s de preparação mesmo
após soltar o botão; segurar continua os disparos a cada 0,50 s. Trocar a
arma, pausar ou cancelar os controles interrompe a preparação pendente.
Essa adaptação permite os mesmos controles por toque e mouse.
O coice visual da Nova tem amplitude de 2,8 vezes a referência padrão e
recuperação mais lenta, aplicada no mesmo envelope de arma/animação.

A mira focada da AWP em primeira pessoa usa uma abertura circular com retículo
telescópico, ocultando braços e arma. O scroll aumenta/reduz a ampliação entre
2× e 8×; no celular, os botões +/− fazem o mesmo. Ao sair do escopo, o scroll
volta a alternar a câmera. Em terceira pessoa a AWP mantém a mira focada comum.

Faca, faca tática, faca de combate, machado e bastão com arame usam golpes
curtos com a animação de espada. Socos alternam as animações disponíveis.
Esses danos/alcances são ajustes locais; não são atribuídos a CS. O impacto
acontece durante o golpe, respeita alcance e obstáculos e nunca cria tinta.

O inventário contém exatamente **2 slots de armas de fogo + 1 slot melee**.
O soco permanece disponível fora desses slots. A partida começa com Glock-18,
M4A4 e faca. Ao pegar outra arma de fogo, a arma de fogo selecionada cai no
chão; se estiver com melee/soco, cai a última arma de fogo selecionada.
Uma melee substitui diretamente a melee anterior. A arma recolhida é equipada.

Todos os onze GLBs usam uma faixa colorida discreta em parte do material.
O alinhamento coloca a empunhadura na mão e o cano/lâmina no eixo frontal;
primeira e terceira pessoa compartilham o mesmo modelo e sistema de impacto.
