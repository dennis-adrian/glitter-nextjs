/** Monotonic token so slower responses cannot overwrite a newer search/poll. */
export class LatestRequest {
  #seq = 0;

  next() {
    this.#seq += 1;
    return this.#seq;
  }

  isCurrent(token: number) {
    return token === this.#seq;
  }
}
