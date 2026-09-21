import { ReactNode } from 'react';
import { CardTitle } from '../../../general_components/CardTitle.tsx';
import ListContent from './ListContent.tsx';
import { CurrencyType } from '../../../types/types.ts';
import { LevelThreeLink } from '../helpers/levelThreeLink.ts';

export type LastMovementType = {
  accountName: string; //category of expense
  record: number;
  description: string;
  // What the owner typed, split out of description by the server. Null when the
  // row carries none. description stays beside it: the modal shows the whole
  // sentence, the row shows only the note.
  note?: string | null;
  date: Date | string;
  currency: CurrencyType;
} & (
  // A transaction: the row opens its detail.
  | { transactionId: number; link?: never; rowKey?: never }
  // Not a transaction, so there is no detail to open: the row leads to its own
  // screen, as a pocket allocation leads to its pocket.
  | { transactionId?: never; link: LevelThreeLink; rowKey: string }
);

type LastMovementsProps = {
  data: LastMovementType[] | null;
  title: string;
  // What bounds the list; the default "Last 30 days" is false for the activity teaser (five most
  // recent rows). A ReactNode because the drilled name inside it is coloured.
  subtitle?: ReactNode;
  // Rendered between subtitle and rows, for the pager: a caller cannot place one there from outside,
  // since title and subtitle are drawn here. At the head so the count frames the list.
  listHeader?: ReactNode;
  // Pinned beside the title, not inside listHeader: an action on the whole list (export) is not a
  // narrowing, and sharing the search row with it collapsed the search field.
  titleAction?: ReactNode;
};

function LastMovements({
  data,
  title,
  subtitle = 'Last 30 days',
  listHeader,
  titleAction,
}: LastMovementsProps) {
  // An absent list is an empty list, and ListContent renders its own empty state;
  // a placeholder row would publish record: 0 and transactionId: 0, reading a
  // missing figure as zero and opening a transaction that does not exist.
  const lastMovements = data ?? [];

  return (
    <>
      <article className='goals__last__movements'>
        <div
          className={`presentation__card__title__container${
            titleAction ? ' flx-row-sb' : ''
          }`}
        >
          <CardTitle>{title}</CardTitle>

          {titleAction}
        </div>

        <div className='main__subtitle'>{subtitle}</div>

        {listHeader}

        <ListContent listOfItems={lastMovements} />
      </article>
    </>
  );
}

export default LastMovements;
