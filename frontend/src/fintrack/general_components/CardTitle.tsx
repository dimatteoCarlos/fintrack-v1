import './styles/cardTitle.css';

type ChildrenPropType = {
  children: React.ReactNode;
  // Legend pinned to the right of the title, over the column of values it names.
  legend?: React.ReactNode;
  // A quieter second row naming what the second line of each list row shows, as
  // title and legend name the first. Both halves are optional.
  subtitle?: React.ReactNode;
  subLegend?: React.ReactNode;
  // The heading level. h2 because every card sits under its page's own h1; a
  // caller nested deeper passes the level its own outline needs.
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
};

// A heading element, not a div, so the page has structure to navigate by. Every
// rule in cardTitle.css selects a class, so the tag does not affect appearance.
export function CardTitle({
  children,
  legend,
  subtitle,
  subLegend,
  as: Heading = 'h2',
}: ChildrenPropType) {
  const hasSub = Boolean(subtitle || subLegend);

  // Without a second row the markup stays the single-heading form other screens use.
  if (!hasSub) {
    return (
      <Heading
        className={`presentation__card--title${
          legend ? ' presentation__card--title--split' : ''
        }`}
      >
        {children}{' '}
        {legend && <span className='presentation__card--legend'>{legend}</span>}
      </Heading>
    );
  }

  return (
    <div className='presentation__card--title presentation__card--title--stacked'>
      <div className='presentation__card--row'>
        {/* The heading is the title alone. Wrapping the stack would put the
            second row inside the heading text. */}
        <Heading className='presentation__card--heading'>{children}</Heading>
        {legend && <span className='presentation__card--legend'>{legend}</span>}
      </div>

      <div className='presentation__card--row presentation__card--row--sub'>
        <span>{subtitle}</span>
        <span>{subLegend}</span>
      </div>
    </div>
  );
}
