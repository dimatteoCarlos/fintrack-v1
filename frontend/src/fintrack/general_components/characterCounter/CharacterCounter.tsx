// Character counter for input labels: current/max, coloured as the limit nears; null without maxLength.

export type CharacterCounterProps = {
  value: string;
  maxLength?: number;
  className?: string;
};

// Counts code points: Array.from keeps surrogate pairs that .length would split.
const countCharacters = (str: string): number => {
  return Array.from(str).length;
};

const getCounterColor = (current: number, max: number): string => {
  const ratio = current / max;

  if (current >= max) {
    return '#ff4d4d'; // red: at limit
  }
  if (ratio >= 0.8) {
    return '#ffaa00'; // orange: 80% or more
  }
  if (ratio >= 0.6) {
    return '#dbf26a'; // lime: 60% or more
  }
  return 'rgba(255,255,255,0.4)'; // faint white: normal
};

const getFontWeight = (current: number, max: number): 'bold' | 'normal' => {
  return current >= max ? 'bold' : 'normal';
};

const CharacterCounter = ({ 
  value, 
  maxLength,
  className = '',
}: CharacterCounterProps): JSX.Element | null => {

  if (maxLength === undefined) {
    return null;
  }

  const currentLength = countCharacters(value);
  const counterColor = getCounterColor(currentLength, maxLength);
  const fontWeight = getFontWeight(currentLength, maxLength);

  return (
    <span
      className={className}
      style={{
        fontSize: '0.75rem',
        marginLeft: '0.5rem',
        color: counterColor,
        fontWeight,
        transition: 'color 0.2s ease',
      }}
      aria-label={`${currentLength} of ${maxLength} characters`}
      title={`${currentLength} of ${maxLength} characters`}
    >
      {currentLength>0 && `${currentLength}/${maxLength}`}
    </span>
  );
};

export default CharacterCounter;