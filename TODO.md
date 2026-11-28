# TODO

このリポジトリでまだやっていないことを, 優先度の順に並べる. 終えたら消す.
優先度: 高・中・低は相対で, 項目があるかぎり高と中を空にしない. 高 = 今の節目「5 つの段階のアプリを 1 つのアプリに統合する」に要るものと, リポジトリの間の食い違い. 中 = 高の次に進めるもの. 低 = 残り (まだ扱っていない型を足す作業もここに置く). 条件待ち = 実例か利用者の判断か上流の版が要る.

## 優先度 高

無し

## 優先度 中

無し

## 優先度 低

無し

## 条件待ち

### Linux の殻で torchaudio の部品を使えるようにする
- 何を: Linux で `make extras EXTRAS=torchaudio` (と `all`) を足して torchaudio の部品が使えるかを確かめ, 要るなら殻の lock の torch の版を合わせる. docs/DESIGN.md の 6 と 8 の節, README, docs/GUIDE.md の Linux の断りを消す (torch 2.15 と torchaudio 2.11 の上流の版のずれで, Linux では torchaudio を読み込めない)
- 待っているもの: 上流が殻の torch (2.15) に合う torchaudio を出すこと (今は PyPI にも CPU の index にも無く, 2.11 までしか無い)
