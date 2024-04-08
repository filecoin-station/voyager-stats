export interface Logger {
  info: typeof console.info;
  error: typeof console.error;
  request: typeof console.info;
}

export interface Filter {
  from: string;
  to: string;
}
