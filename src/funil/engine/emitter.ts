/** Emissor mínimo de eventos, sem dependências. */
export type Listener<T> = (payload: T) => void

export class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(name: K, cb: Listener<Events[K]>): () => void {
    let set = this.map.get(name)
    if (!set) this.map.set(name, (set = new Set()))
    set.add(cb as Listener<never>)
    return () => set!.delete(cb as Listener<never>)
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]) {
    const set = this.map.get(name)
    if (!set) return
    for (const cb of set) (cb as Listener<Events[K]>)(payload)
  }

  clear() {
    this.map.clear()
  }
}
