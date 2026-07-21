export class Fmp4FragmentAssembler {
  #pendingMoof?: Buffer;

  public push(data: Buffer, boxTypes: readonly string[]): Buffer | undefined {
    const hasMoof = boxTypes.includes('moof');
    const hasMdat = boxTypes.includes('mdat');

    if (hasMoof && hasMdat) {
      this.#pendingMoof = undefined;
      return data;
    }

    if (hasMoof) {
      this.#pendingMoof = data;
      return undefined;
    }

    if (hasMdat && this.#pendingMoof) {
      const fragment = Buffer.concat([this.#pendingMoof, data]);
      this.#pendingMoof = undefined;
      return fragment;
    }

    return undefined;
  }
}
