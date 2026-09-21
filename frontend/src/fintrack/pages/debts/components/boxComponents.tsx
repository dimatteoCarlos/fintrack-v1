type ChildrenPropType = { children: React.ReactNode };

// Deliberately no .flx-row-sb: this container stacks its BoxRow children, and a
// row layout would lay them side by side.
export function BoxContainer({ children }: ChildrenPropType) {
  return <div className='box__container'>{children}</div>;
}

export function BoxRow({ children }: ChildrenPropType) {
  return <div className='box__row flx-row-sb'>{children}</div>;
}

export function StatusSquare({ children }: { children: React.ReactNode }) {
  return <span className='status__square'>{children}</span>;
}
