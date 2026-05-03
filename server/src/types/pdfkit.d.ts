declare module 'pdfkit' {
  interface PDFTextOptions {
    lineBreak?: boolean;
    width?: number;
    height?: number;
    align?: 'left' | 'center' | 'right' | 'justify';
    indent?: number;
    paragraphGap?: number;
    lineGap?: number;
    wordSpacing?: number;
    characterSpacing?: number;
    fill?: boolean;
    stroke?: boolean;
    link?: string;
    underline?: boolean;
    strike?: boolean;
    oblique?: boolean;
    baseline?: 'svg-middle' | 'alphabetic' | 'hanging' | number;
    continued?: boolean;
    ellipsis?: boolean | string;
  }

  interface PDFDocumentOptions {
    size?: string | [number, number];
    margin?: number;
    margins?: { top: number; bottom: number; left: number; right: number };
    layout?: 'portrait' | 'landscape';
    info?: Record<string, unknown>;
    autoFirstPage?: boolean;
    bufferPages?: boolean;
    font?: string;
    compress?: boolean;
    userPassword?: string;
    ownerPassword?: string;
    permissions?: Record<string, boolean>;
  }

  class PDFDocument {
    page: {
      width: number;
      height: number;
      margins: { top: number; bottom: number; left: number; right: number };
    };
    x: number;
    y: number;

    constructor(options?: PDFDocumentOptions);

    pipe<T>(dest: T): T;
    end(): void;
    addPage(options?: PDFDocumentOptions): this;

    font(src: string, family?: string): this;
    fontSize(size: number): this;
    fillColor(color: string, opacity?: number): this;
    strokeColor(color: string, opacity?: number): this;

    text(text: string, options?: PDFTextOptions): this;
    text(text: string, x: number, y: number, options?: PDFTextOptions): this;

    heightOfString(text: string, options?: PDFTextOptions): number;

    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;

    rect(x: number, y: number, w: number, h: number): this;
    fillAndStroke(fillColor: string, strokeColor: string): this;

    on(event: string, callback: (...args: unknown[]) => void): this;
  }

  export = PDFDocument;
}
