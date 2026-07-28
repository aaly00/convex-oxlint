export const Comp = () => (
  <div className="x" {...props}>
    text {1 + 2}
    <Self.Closing a b={1} />
    <>{null}</>
  </div>
);
declare const props: Record<string, unknown>;
declare const Self: { Closing: (p: unknown) => unknown };
