# TODO

このリポジトリでまだやっていないことを, 優先度の順に並べる. 終えたら消す.
優先度: 高・中・低は相対で, 項目があるかぎり高と中を空にしない. 高 = 今の節目「5 つの段階のアプリを 1 つのアプリに統合する」に要るものと, リポジトリの間の食い違い. 中 = 高の次に進めるもの. 低 = 残り (まだ扱っていない型を足す作業もここに置く). 条件待ち = 実例か利用者の判断が要る.

## 優先度 高

### 共通の部品をそろえる
- 何を: 5 つのアプリが docs/DESIGN.md の R12 (9 の節の「共通の部品」) に合わせる. 各アプリは殻の `parts/common.tsx` をそのまま `frontend/src/components/common.tsx` に写し, 今の `components/ui.tsx` と `components/Dialog.tsx` の同じ部品を写しに置き換え (段階に固有の部品は `ui.tsx` に残し, `common` を書き出す), API の誤りを `errorText` で文にし, 自分の対話の枠 (ML-Dashboard の登録の対話と画像の対話など) を `Dialog` にし, 頭の見出しを R12 の「見出し」に合わせる. 各アプリへの頼み方: 各アプリの TODO.md の「画面の共通の部品を殻にそろえる」の何をを「殻の R12 に合わせて `parts/common.tsx` を写し, 同じ役目の部品を写しに置き換える」に, 終わりの条件を「殻の `scripts/check_parts.py` が自分を『合っています』と出し, 自分の検査とテストが通る」に直してもらう (ML-Pathfinder は条件待ちにあるので高に移してもらう). 1 つのアプリ (ML-Pathfinder か ML-Provide. 今の部品が正に一番近い) で先に写して殻に載せた形で通し, 正の誤りを直してから残りに広げる (9 の節の進め方). 5 つが合ったら殻の CI の `check_parts.py` に `--strict` を付けて差で落とす
- なぜ: 段階ごとに部品の見た目と動き (対話の枠の閉じ方, 誤りの文の形, Card の読み上げの区域, 見出し) が違うと, 1 つのアプリとして使いにくいため
- 終わりの条件: 殻の CI の `check_parts.py` が 5 つのアプリ全てを「合っています」と出し, `--strict` で動いて差を見つけたら落ちる. 殻の e2e (studio と journey) が通る
- つながり: 各アプリの TODO.md の「画面の共通の部品を殻にそろえる」. docs/DESIGN.md の 9 の節の R12. 共通の部品を別のリポジトリのパッケージにする形は, 5 つが合った後に考える

## 優先度 中

### ライブラリが返す文を言葉の表にそろえる
- 何を: ライブラリ (ML-Quest, ML-ModelControl, ML-Inference) が返して段階の画面にそのまま出る文 (確かめの文, 誤り, 使えない理由, 結論の文. 1 つの問題を指す「問題の設定」, 「確認」, 「人の確認に回す」など) を docs/DESIGN.md の 5 の節の「段階をまたぐ言葉」の表に合わせる. ライブラリで直し, 各アプリが上げた後に, 共通のライブラリの版の表と殻の submodule を 1 つの PR で上げる
- なぜ: 5 つの段階の画面の文は表に合ったが, ライブラリから来る文が表と合わず, 同じ画面に違う語が並ぶため
- 終わりの条件: 3 つのライブラリの画面に出る文が表の語になり, 表と殻の submodule をその版に上げて, 殻の e2e (studio と journey) が通る
- つながり: ML-Pathfinder の TODO.md の「ML-Quest が返す文を殻の言葉の表にそろえる」, ML-CreateArchitecture の「ライブラリが返す文を画面の言葉にそろえる」, ML-Provide の「ML-Inference が返す文を殻の言葉の表にそろえる」. docs/DESIGN.md の 8 の節 (共通のライブラリの版) と R11

### 画面の例の画像を撮り直す
- 何を: README と docs/GUIDE.md の画像 (`docs/images/*.png`, `docs/images/guide/*.png`) を撮り直す. 今の画像は上の帯の欄の名前が「プロジェクト」のまま写っている. 次の画像は段階の画面の語も前の語のまま写っている: `docs/images/export.png` (「この場所を問題に記録しました」), `docs/images/guide/data_start.png` (「選んだ問題」のカードと「この問題から始める」), `docs/images/guide/model_project.png` (「データセットと学習のプロジェクト」の対話の「選んだ問題」と「学習のプロジェクトに保存」), `docs/images/guide/train_start.png` (「選んだ問題」の欄), `docs/images/guide/infer_register.png` (「全ての問題の実験を出す」)
- なぜ: 画面の欄の名前は「問題」で, 段階の画面の語も表に合ったので, 文と画像の語が食い違うため
- 終わりの条件: 全ての画像の上の帯に「問題」の欄が写り, 段階の画面の語が今の画面と同じになる. 中の「ライブラリが返す文を言葉の表にそろえる」の後に撮れば 1 度で済む
- つながり: 中の「ライブラリが返す文を言葉の表にそろえる」の後

## 優先度 低

### Linux の殻で torchaudio の部品を使えるようにする
- 何を: 上流が殻の torch (2.15) に合う torchaudio を出したら, Linux で `make extras EXTRAS=torchaudio` (と `all`) を足して torchaudio の部品が使えるかを確かめ, 要るなら殻の lock の torch の版を合わせる (今は PyPI にも CPU の index にも torch 2.15 に合う torchaudio が無く, 2.11 までしか無い)
- なぜ: torch 2.15 と torchaudio 2.11 の上流の版のずれで, Linux では torchaudio を読み込めず, torchaudio の部品が使えないため
- 終わりの条件: Linux で torchaudio を足した殻で, モデルの作成・選定の段階の部品の一覧に torchaudio の部品が使えると出る. docs/DESIGN.md の 6 と 8 の節, README, docs/GUIDE.md の Linux の断りを消す
- つながり: 無し

## 条件待ち

無し
