// The foldable block of the overview page (domain cards, snapshot, trend, ranking, donut). Built on
// details/summary for free keyboard, role, announced expanded state and find-in-page opening.
// The head is a prop because callers do not share one: CardTitle for page blocks, a name row for cards.

import { ReactNode, useState } from 'react';

type CollapsibleBlockProps = {
 head: ReactNode;
 children: ReactNode;
 // Open on arrival: folding is the reader's choice, never a state the page
 // starts in.
 defaultOpen?: boolean;
 // 'block' is a page section under its own title; 'card' is one domain card in
 // the grid. They differ only in the head's padding, hence a modifier.
 variant?: 'block' | 'card';
 // The caller's block class, carried onto the same element: a domain card passes
 // 'domainCard' so its border, radius and padding stay declared in one place.
 className?: string;
 // A hairline above the block, for a page section that follows another one.
 // A prop and not a caller class, because the rule belongs to this block.
 isRuled?: boolean;
};

function CollapsibleBlock({
 head,
 children,
 defaultOpen = true,
 variant = 'block',
 className,
 isRuled = false,
}: CollapsibleBlockProps) {
 // Controlled on purpose: React re-applies the open attribute on every render, so
 // an uncontrolled details would snap back open whenever the month picker
 // re-renders the page.
 const [isOpen, setIsOpen] = useState(defaultOpen);

 return (
  <details
   className={`collapsible collapsible--${variant}${
    isRuled ? ' collapsible--ruled' : ''
   }${className ? ` ${className}` : ''}`}
   open={isOpen}
   onToggle={(event) => setIsOpen(event.currentTarget.open)}
  >
   <summary className='collapsible__head'>
    <div className='collapsible__headContent'>{head}</div>

    {/* aria-hidden because summary already announces the expanded state. A
        chevron that also named it would be read twice. */}
    <span className='collapsible__chevron' aria-hidden='true' />
   </summary>

   <div className='collapsible__body'>{children}</div>
  </details>
 );
}

export default CollapsibleBlock;
