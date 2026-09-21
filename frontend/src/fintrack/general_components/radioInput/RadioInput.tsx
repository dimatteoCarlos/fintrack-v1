import './styles/radioInput-styles.css';

/** 'inputChipMode' renders compact horizontal chips (mobile); 'inputRadioMode' renders radio buttons. */
export type AccountTypeSelectionModeType = 'inputRadioMode' | 'inputChipMode';

export type RadioInputPropsType<T = string> = {
  radioOptionSelected: T;
  inputRadioOptions: { value: T; label: string; disabled?: boolean }[];
  setRadioOptionSelected: (radioOptionSelected: T) => void;
  title?: string;
  /** Unique per group; part of each option input's id. */
  labelId: string;
  disabled: boolean;
  accountTypeSelectionMode?: AccountTypeSelectionModeType;
};

const RadioInput =  <T extends string>({
  radioOptionSelected,
  inputRadioOptions,
  setRadioOptionSelected,
  title = '',
  labelId,
  disabled=false,
  accountTypeSelectionMode = 'inputRadioMode',
}: RadioInputPropsType<T>) => {
  const onChangeHandleRadio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSelectedOption = e.target.value as T;
    setRadioOptionSelected(newSelectedOption);
  };

  const isChipMode = accountTypeSelectionMode === 'inputChipMode';

  const InputOptionsClassName = `radio-input__options ${
   isChipMode ? 'radio-input__options--chip' : ''
  }`;

  return (
    <>
      <div className='radio-input__container '>
 {title && <div className='radio-input__title'>{title}</div>}
        <div className={InputOptionsClassName}>
          {inputRadioOptions?.map((option, index) => (
            <div
              className='radio-input__option'
              key={`radio-input__option-${index}`}
            >
              <input
                type='radio'
                id={`option-${labelId}-${index}`}
                value={option.value}
                // The group's flag or the option's own: one option can be off
                // while its siblings stay selectable.
                disabled={disabled || option.disabled === true}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChangeHandleRadio(e)
                }
                checked={option.value === radioOptionSelected}
                className={ 'radio-input__radio'}
              />
              <label
                htmlFor={`option-${labelId}-${index}`}
                className={'radio-input__label'}
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default RadioInput;
