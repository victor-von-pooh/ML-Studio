# TODO

このリポジトリでまだやっていないことを, 優先度の順に並べる. 終えたら消す.
優先度: 高・中・低は相対で, 項目があるかぎり高と中を空にしない. 高 = 今の節目「5 つの段階のアプリを 1 つのアプリに統合する」に要るものと, リポジトリの間の食い違い. 中 = 高の次に進めるもの. 低 = 残り (まだ扱っていない型を足す作業もここに置く). 条件待ち = 実例か利用者の判断が要る.

## 優先度 高

### 画面の例の画像を撮り直す
- 何を: README と docs/GUIDE.md の画像 (`docs/images/*.png`, `docs/images/guide/*.png`) を撮り直す. 今の画像は上の帯の欄の名前が「プロジェクト」のまま写っている. 次の画像は, 段階の画面の文も前の語のまま写っている (括弧の中は今の画面の文): `docs/images/export.png` (「この場所を問題に記録しました」), `docs/images/guide/data_start.png` (「選んだ問題」のカードと「この問題から始める」), `docs/images/guide/model_project.png` (「データセットと学習のプロジェクト」の対話の「選んだ問題」と「学習のプロジェクトに保存」), `docs/images/guide/train_start.png` (「選んだ問題」の欄), `docs/images/guide/infer_register.png` (「全ての問題の実験を出す」)
- なぜ: 画面の欄の名前は「問題」で, 段階の画面の語も表に合い, 各段階の頭の見出しも段階の名前になったので, 文と画像の語が食い違うため
- 終わりの条件: 全ての画像の上の帯に「問題」の欄が写り, 段階の画面の語と頭の見出しが今の画面と同じになる
- つながり: 無し

## 優先度 中

### Linux の殻で torchaudio の部品を使えるようにする
- 何を: 上流が殻の torch (2.15) に合う torchaudio を出したら, Linux で `make extras EXTRAS=torchaudio` (と `all`) を足して torchaudio の部品が使えるかを確かめ, 要るなら殻の lock の torch の版を合わせる (今は PyPI にも CPU の index にも torch 2.15 に合う torchaudio が無く, 2.11 までしか無い)
- なぜ: torch 2.15 と torchaudio 2.11 の上流の版のずれで, Linux では torchaudio を読み込めず, torchaudio の部品が使えないため
- 終わりの条件: Linux で torchaudio を足した殻で, モデルの作成・選定の段階の部品の一覧に torchaudio の部品が使えると出る. docs/DESIGN.md の 6 と 8 の節, README, docs/GUIDE.md の Linux の断りを消す
- つながり: 無し

## 優先度 低

無し

## 条件待ち

無し
