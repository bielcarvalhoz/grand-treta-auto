# Calibração do personagem e física — 2026-10-11

## Usar no celular

1. Abra **`/debug` → Ajustar mãos / armas** (`B` no teclado). A URL entra diretamente no treino e oferece apenas treino/configurações. O treino normal não monta o painel.
2. Selecione arma e perspectiva. O seletor equipa diretamente a arma no slot correspondente para facilitar a calibração.
3. **Arma nas mãos**: posição relativa aos eixos locais da mão direita, rotação XYZ em graus e escala XYZ. Os valores são offsets/multiplicadores sobre o encaixe padrão, e primeira/terceira pessoa são independentes.
4. **Braços na câmera**: enquadramento dos dois braços em primeira pessoa, por arma; `X` é direita, `Y` é cima e `Z` positivo aproxima da câmera. Inclui socos. A rotação e escala afetam o conjunto, preservando o encaixe.
5. Toque num número e use `− / +`, ou digite. Passos: 0,01 m, 1 grau, 0,01 de escala. As alterações ficam salvas neste navegador.
6. **Preparar print** mostra cartão compacto com nome e ID, perspectiva, alvo e nove valores. Envie o print com o enquadramento do jogo. **Copiar config** fornece JSON com as mesmas informações e unidades. **Restaurar** afeta só a arma/vista/alvo selecionados.

O painel fecha ao abrir o menu. Os valores calibrados continuam aplicados ao voltar, no treino normal e na campanha. O slot é alterado apenas no seletor de arma; câmera e configuração de braços não substituem o inventário. **Restaurar** retorna aos padrões abaixo. Ajustes anteriores são migrados sem somar os novos padrões aos valores já salvos.

## Padrões aprovados nos prints

| Armas | Vista | Posição XYZ (m) | Rotação XYZ (°) | Escala XYZ |
| --- | --- | --- | --- | --- |
| Machado e bastão | 1ª | -0,03; -0,14; -0,10 | 29; -8; 68 | 1; 1; 1 |
| Machado e bastão | 3ª | -0,02; -0,01; -0,06 | -44; -56; 45 | 0,99; 1; 1 |
| Todas as facas | 1ª | -0,01; 0; 0,02 | 78; 9; -29 | 1; 1; 1,03 |
| Todas as facas | 3ª | 0; -0,01; 0,02 | -64; -62; -33 | 1; 1; 1 |

## Diagnósticos e correções

- **Piso acima do campo:** `Collider.castRay` retorna `-1` quando não há interseção. O código aceitava qualquer valor diferente de `null`, convertendo o erro em `topoDaCaixa + 2`, mesmo longe da caixa. Agora filtra limites X/Z e exige distância finita não negativa. Inclui o caso de caixa girada, em que o raio passa dentro do AABB mas fora do corpo. Nenhum arquivo de mapa/campus, terreno ou visual foi alterado.
- **Tremor das mãos:** reproduzido ao mudar câmera e atualizar o encaixe antes do próximo quadro: o rig permanecia na câmera anterior, provocando saltos de 3–4 cm. A pose é reavaliada em `dt = 0` quando câmera/olhos mudam. O balanço intencional em primeira pessoa foi reduzido a 35%, mantendo a terceira pessoa.
- **Soco em primeira pessoa:** usa a guarda `Punch_Enter` e os golpes completos `Punch_Jab`/`Punch_Cross`, sem a pose de pistola. `first-person-fists.js` aplica uma transformação fixa aos pulsos e ombros animados, reduzindo a amplitude para enquadrar o golpe inteiro em retrato/paisagem. Limitar o pulso a cada quadro cortava o avanço/retorno; deslocar o ombro junto com o pulso mantinha o cotovelo travado. Agora o ombro acompanha o tronco original de forma independente e a cadeia de dois ossos permite estender e recolher o braço no tempo do clipe, com as mãos visíveis e o início dos braços fora da tela. A orientação dos punhos vem dos clipes originais; a curvatura dos dedos é reforçada nessa vista para fechar as mãos. O painel altera o enquadramento depois dessa adaptação. A terceira pessoa mantém os clipes originais. A regressão compara ambas as trajetórias quadro a quadro, a extensão do cotovelo e o retorno à guarda.
- **Cabeça baixa em melee/soco:** a inclinação do quadril e do clipe superior chegava à cabeça. A cadeia superior compensa o quadril e a cabeça usa a orientação ereta de repouso; golpes e pernas mantêm a animação.
- **Polegares:** pequeno enchimento skinned, fundido às duas malhas das mãos. Mantém materiais e número de meshes/draw calls, e preserva o arquivo GLB original.
- **Caixas:** madeira de 6 kg, 1,20 m de lado; metal de 72 kg, 1,60 m, 5,6 m à direita e 1 m atrás da madeira. Impulsos são multiplicados por 4 nos tiros e 4,5 nos golpes; dano/cadência das armas permanecem os mesmos. Mesmo impacto produz 12 vezes mais velocidade na madeira antes do atrito. Metal fica fora do círculo de coleta da campanha e da faixa de armas do treino.
- **Pintura:** triângulos recortados em torno de um pincel 3D, com máscara contínua em quinas/curvas e entre meshes estáticos. Instâncias usam suas matrizes próprias. Pintura dinâmica acompanha o corpo. Novas cores são opacas, ordenadas pela sequência do impacto; depth test, afastamento pequeno por face e polygon offset preservam oclusão sem disputa de profundidade com o modelo.

## Validação e limites

`npm test` cobre regressões do piso, caixa girada, diferença de massa, guarda/punches em retrato e paisagem, câmera entre quadros, cabeça ereta, isolamento/persistência das configurações, encaixes de todas as armas, curvas, quinas, costuras, instâncias, ordem de tinta após reciclagem e acompanhamento do corpo móvel. `npm run build` verifica o bundle de produção. A interface foi exercitada no navegador a 390 × 844; a edição, isolamento entre armas/perspectivas, restauração e cartão de print foram conferidos.

`node scripts/benchmark-surface-paint.mjs` projeta 600 impactos numa cena sintética de 171.680 triângulos. Medição neste computador: mediana 0,038 ms, percentil 95 de 0,370 ms, máximo 2,164 ms; maior patch com 720 vértices/192 triângulos consultados. São 96 buffers fixos de 1536 vértices, 3,38 MiB de posição/coordenadas do pincel, com upload só da região usada. A projeção é calculada somente no impacto. `node scripts/benchmark-paintball.mjs` preservou os 240 resultados dos raios do benchmark existente.

Essas medições são de CPU e não prometem um FPS específico no aparelho. A GPU e o Safari de um celular real ainda precisam de medição. Mantêm-se as exclusões existentes de personagens, folhagem/grama animadas e água/transparências; superfícies sólidas do cenário usam a mesma projeção. O pool mantém as 96 manchas mais recentes para limitar memória e renderização.
