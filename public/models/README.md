# Personagem Sato

`sato.glb` é o arquivo `sato (4).glb` fornecido pelo usuário, copiado integralmente.
Não foi reexportado ou modificado: conserva malhas, texturas, esqueleto e 46 clipes.

SHA-256: `96cb51b751f9664cc797bdf04c0d29196dbd8d671b8ba4f4085d439b54f50e20`.

O jogo carrega este único arquivo para ambas as câmeras. A primeira pessoa exibe
somente `Sato_arm_hand_L` e `Sato_arm_hand_R`; as duas vistas compartilham o mesmo
esqueleto e os mesmos materiais. O alinhamento das armas acontece no runtime.

## Armas

`pistol-quaternius.glb` e `assault-rifle-quaternius.glb` são cópias dos arquivos
“Pistol by Quaternius - J3i9KDQ3kt.glb” e “Assault Rifle by Quaternius - Bgvuu4CUMV.glb”
fornecidos pelo usuário (autor indicado nos nomes: Quaternius).
O runtime normaliza os transforms de origem para comprimentos de 26 cm e 75 cm,
alinha o centro da empunhadura com a mão e registra a saída do cano.
A cor da tinta filtra somente uma faixa do slide da pistola e o material
`MainLight` do rifle, preservando os demais materiais cinza. Os arquivos não são reexportados.
