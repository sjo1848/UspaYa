export interface DomainEvent<
  TName extends string = string,
  TPayload extends object = Readonly<Record<string, never>>,
> {
  readonly name: TName;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payload: Readonly<TPayload>;
}
