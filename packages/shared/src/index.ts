/** A local advisory signal, never an authorization decision. */
export interface ThreatEvent {
  type: string;
  timestamp: number;
  detail?: string;
}
