# Workout Share

GitHub Pages で配信する、静的なワークアウト共有アプリです。  
入力したトレーニング内容を LIFF 上でまとめ、LINE の `shareTargetPicker` を使って共有する前提で作っています。

## 現在の仕様

### 配信と構成

- 静的ホスティング前提です。
- サーバー、DB、GAS は未使用です。
- ファイル構成は以下の 4 ファイルです。
  - `index.html`
  - `style.css`
  - `config.js`
  - `app.js`

### 現在の主な機能

- 入力タブ
  - 日付
  - ワークアウトタイトル
  - 種目の複数追加
  - 各エクササイズカード内で「部位 → 種目」の順に選択
  - セットの複数追加
  - 重量、回数、メモ入力
- 種目候補
  - `app.js` 内にローカルの種目カタログを保持
  - 日本語名で管理
  - 部位ごとの候補表示
  - カード形式で選択
- プレビュータブ
  - Flex Message の見た目確認
  - 種目ごとの推定 1RM
  - セット内容確認
  - ボリュームは送信表示に含めない
- 履歴タブ
  - `localStorage` に保存した履歴の表示
  - 再入力
  - 削除
- 共有
  - `liff.shareTargetPicker()` を使用
  - LIFF 利用不可時は共有実行は行わず、プレビュー中心で動作

### LIFF / プロフィール取得

- `liff.init({ liffId: LIFF_ID })` 実行後に LIFF 機能を使用します。
- ログイン済みかつ `liff.getProfile()` が成功した場合のみ表示名を使います。
- 取得できない場合は `anonymous` 扱いです。
- 外部ブラウザや LIFF 初期化失敗時でも、プレビュー専用モードとして使える設計です。

### 保存まわり

- 現在の保存先は `LocalStorageWorkoutRepository` です。
- `saveWorkout()` は adapter 風に切ってあり、将来 `ApiWorkoutRepository` へ差し替え可能です。

### デバッグモード

- `config.js` の `FEATURE_FLAGS.enableDebugMode` で切り替えます。
- デバッグモード時のみ以下を表示します。
  - Flex JSON コピー
  - Flex JSON プレビュー
  - ランキングタブ

## 設定

`config.js` の設定値:

- `LIFF_ID`
  - LIFF アプリ ID
- `APP_NAME`
  - 画面上のアプリ名
- `DEFAULT_GROUP_KEY`
  - LIFF コンテキストが取れない場合のフォールバック
- `FEATURE_FLAGS.enableDebugMode`
  - デバッグ UI の表示
- `FEATURE_FLAGS.enableLocalHistory`
  - ローカル履歴の有効化
- `FEATURE_FLAGS.enableStatsMock`
  - モックランキングの有効化
- `FEATURE_FLAGS.enableApiAdapter`
  - 将来の API 保存 / API 取得の切り替え口
- `FEATURE_FLAGS.enableRanking`
  - ランキングタブの有効化

## データ構造

現在のワークアウトオブジェクトは次の形をベースにしています。

```js
{
  workoutId: string,
  date: string,
  title: string,
  user: {
    userId: string | null,
    displayName: string | null,
    pictureUrl: string | null
  },
  groupKey: string | null,
  exercises: [
    {
      exerciseId: string,
      catalogId: string,
      primaryMuscle: string,
      name: string,
      memo: string,
      sets: [
        {
          setId: string,
          weight: number | "",
          reps: number | "",
          volume: number,
          estimated1rm: number
        }
      ],
      totalVolume: number,
      maxEstimated1rm: number
    }
  ],
  totalVolume: number,
  createdAt: string,
  updatedAt: string
}
```

## 現在の計算仕様

- `volume = weight * reps`
- `estimated1rm = weight * (1 + reps / 30)`
- 空セット、重量未入力、回数未入力は共有対象外
- `volume` は内部計算には残すが、現在の送信表示では使わない

## 現在の UI 方針

- スマホファースト
- 固定アクションバーあり
- 片手で押しやすい大きめ入力
- 種目カード / セットカード中心
- ユーザー向け画面では LIFF や開発用語をできるだけ見せない

## 今後の想定

### 1. 種目マスタの外出し

現在は `app.js` 内のローカル配列ですが、将来は次を想定しています。

- JSON ファイル化
- API / DB から取得
- グループ別の種目候補
- よく使う種目の並び替え

### 2. 保存先の拡張

- GAS / Spreadsheet 保存
- API 経由の保存
- ユーザー別 / グループ別の履歴集約

### 3. ランキング / 統計

- 現在はデバッグ用のモック前提
- 将来は API 取得へ差し替え
- 期間別、部位別、種目別などを想定

### 4. UX 改善の候補

- ボリューム表示はノイジーなので縮小または除外の再検討
- 種目選択 UI の改善
- 日本語種目名の拡充
- LINE 共有文面の簡素化

## メモ

- API キーや秘密情報は置かない前提です。
- GitHub Pages に配置すればそのまま動く構成を維持します。
