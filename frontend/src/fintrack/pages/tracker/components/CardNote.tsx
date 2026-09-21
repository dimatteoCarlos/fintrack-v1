import { ChangeEvent } from 'react';

type CardNotePropType = {
  inputNote: string;
  dataHandler: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  title: string;
};

// One constant for the visible placeholder and the accessible name: a placeholder
// vanishes on the first keystroke, and `title` cannot serve as the name because
// it is the form-data key ('note'), not the on-screen label.
const NOTE_LABEL = 'Description';

function CardNote({ dataHandler, inputNote, title }: CardNotePropType) {
  return (
    <>
      <div className='card__screen description '>
        <textarea
          className='input__note__description'
          placeholder={NOTE_LABEL}
          aria-label={NOTE_LABEL}
          name={title}
          rows={3}
          maxLength={90}
          value={inputNote}
          onChange={dataHandler}
        />
      </div>
    </>
  );
}

export default CardNote;
