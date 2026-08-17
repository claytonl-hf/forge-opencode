export class ForgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForgeError";
  }
}

export class ForgeNotRunning extends ForgeError {
  constructor(message: string) {
    super(message);
    this.name = "ForgeNotRunning";
  }
}

export class ForgeNotReady extends ForgeError {
  constructor(message: string) {
    super(message);
    this.name = "ForgeNotReady";
  }
}
