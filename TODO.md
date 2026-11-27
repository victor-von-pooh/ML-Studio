# TODO

このリポジトリでまだやっていないことを, 優先度の順に並べる. 終えたら消す.
優先度: 高・中・低は相対で, 項目があるかぎり高と中を空にしない. 高 = 今の節目「5 つの段階のアプリを 1 つのアプリに統合する」に要るものと, リポジトリの間の食い違い. 中 = 高の次に進めるもの. 低 = 残り (まだ扱っていない型を足す作業もここに置く). 条件待ち = 実例か利用者の判断が要る.

## 優先度 高

### 共通の部品と言葉をそろえる
- 何を: 見出し, 段階の並び, 誤りの出し方などの共通の部品と, 段階の名前や画面の言葉を 5 つの段階でそろえる
- なぜ: 1 つのアプリとして使うと, 段階ごとに部品や言葉が違うことが利用者の迷いになるため
- 終わりの条件: 5 つの段階の画面で共通の部品が同じ見た目と動きになり, 段階の名前と言葉が DESIGN.md の用語にそろう
- つながり: 各アプリの TODO.md の「画面の共通の部品を殻にそろえる」

## 優先度 中

### 学習・評価の段階の記録したプロジェクトの場所を名前で選べるよう ML-Dashboard に頼む
- 何を: 学習・評価の段階の「選んだ問題の設定」の欄の中の「記録したプロジェクト」の場所は, 名前を `dd` (役割 definition) の `aria-labelledby` で持つが, Playwright は ARIA 1.3 に従って definition の名前を計算しない (`getByRole('definition', { name })` も `getByLabel` も見つけない). 名前を計算する役割 (group など) で名前を持つ形を, ML-Dashboard の TODO.md の項目として頼む
- なぜ: 通しの確かめは今, 欄の中の term と definition を役割だけで選び term の文を確かめるので, 欄の中に同じ役割の対が足されると選べなくなるため
- 終わりの条件: ML-Dashboard の TODO.md にあり, 済んだら通しの確かめがその場所を役割と名前で選び, docs/DESIGN.md の 10 の節の断りを消す
- つながり: ML-Dashboard の TODO.md (頼む項目)

## 優先度 低

### Linux の殻で torchaudio の部品を使えるようにする
- 何を: 上流が殻の torch (2.15) に合う torchaudio を出したら, Linux で `make extras EXTRAS=torchaudio` (と `all`) を足して torchaudio の部品が使えるかを確かめ, 要るなら殻の lock の torch の版を合わせる (今は PyPI にも CPU の index にも torch 2.15 に合う torchaudio が無く, 2.11 までしか無い)
- なぜ: torch 2.15 と torchaudio 2.11 の上流の版のずれで, Linux では torchaudio を読み込めず, torchaudio の部品が使えないため
- 終わりの条件: Linux で torchaudio を足した殻で, モデルの作成・選定の段階の部品の一覧に torchaudio の部品が使えると出る. docs/DESIGN.md の 6 と 8 の節, README, docs/GUIDE.md の Linux の断りを消す
- つながり: 無し

## 条件待ち

無し
