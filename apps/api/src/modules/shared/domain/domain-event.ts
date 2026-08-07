export interface DomainEvent<TName extends string = string, TPayload extends object = object> {
  readonly name: TName;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payload: Readonly<TPayload>;
}
