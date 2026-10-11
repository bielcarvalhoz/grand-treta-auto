# Personagem Sato

`sato.glb` é o arquivo `sato (4).glb` fornecido pelo usuário, copiado integralmente.
Não foi reexportado ou modificado: conserva malhas, texturas, esqueleto e 46 clipes.

SHA-256: `96cb51b751f9664cc797bdf04c0d29196dbd8d671b8ba4f4085d439b54f50e20`.

O jogo carrega este único arquivo para ambas as câmeras. A primeira pessoa exibe
somente `Sato_arm_hand_L` e `Sato_arm_hand_R`; as duas vistas compartilham o mesmo
esqueleto e os mesmos materiais. O alinhamento das armas acontece no runtime.
`player/hair.js` inclina e abaixa discretamente pontas/franja em uma cópia da
geometria em memória. O arquivo original, UVs, pesos e animações permanecem preservados.

## Armas

`pistol-quaternius.glb` e `assault-rifle-quaternius.glb` são cópias dos arquivos
“Pistol by Quaternius - J3i9KDQ3kt.glb” e “Assault Rifle by Quaternius - Bgvuu4CUMV.glb”
fornecidos pelo usuário (autor indicado nos nomes: Quaternius).
O runtime normaliza os transforms de origem para comprimentos de 26 cm e 75 cm,
alinha o centro da empunhadura com a mão e registra a saída do cano.
A versão atual carrega os arquivos em `weapons/`, copiados integralmente de
`C:/Users/leona/Downloads`. Os arquivos antigos acima são mantidos para compatibilidade.

| Arquivo em weapons/ | Arquivo fornecido |
| --- | --- |
| pistol.glb | Pistol by Quaternius - J3i9KDQ3kt.glb |
| automatic.glb | Assault Rifle by Quaternius - Bgvuu4CUMV.glb |
| revolver.glb | Revolver by Quaternius - XrnLUz6kQj.glb |
| shotgun.glb | Shotgun by Quaternius - DcNE0HVdW8.glb |
| sniper.glb | Sniper Rifle by Quaternius - XCIC2Ae4Rb.glb |
| smg.glb | Submachine Gun by Quaternius - 7ehatxr7FY.glb |
| knife.glb | Knife by Quaternius - YnC9RcBOWs.glb |
| knife-tactical.glb | Knife by Quaternius - NNzzvlGXzO.glb |
| knife-combat.glb | Knife.glb |
| axe.glb | Axe by Quaternius - W0UYZPYSXf.glb |
| bat.glb | Wooden Bat Barbed by Quaternius - HSM4KnggSz.glb |

O arquivo “Bat by Quaternius” é um morcego, portanto não é uma arma.
O autor Quaternius é indicado pelos nomes originais quando presente.
Uma faixa de cor é aplicada em parte do material no shader de cada arma,
preservando as texturas e a maior parte das cores originais. A normalização,
empunhadura e cor são ajustes em memória; os GLBs não são reexportados.
Referências de dano e funcionamento: [docs/weapons.md](../../docs/weapons.md).
