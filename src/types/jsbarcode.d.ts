// JsBarcode の符号化部分（L1 でバーコードの符号を比べるためだけに使う。devDependencies）。型が無いため必要な分だけ宣言する
interface JsBarcodeEncoder {
  encode(): { data: string; text: string };
}
type JsBarcodeEncoderClass = new (data: string, options: { flat?: boolean }) => JsBarcodeEncoder;

declare module 'jsbarcode/bin/barcodes/CODE128' {
  export const CODE128: JsBarcodeEncoderClass;
}
declare module 'jsbarcode/bin/barcodes/CODE39' {
  export const CODE39: JsBarcodeEncoderClass;
}
declare module 'jsbarcode/bin/barcodes/EAN_UPC' {
  export const EAN13: JsBarcodeEncoderClass;
  export const EAN8: JsBarcodeEncoderClass;
}
