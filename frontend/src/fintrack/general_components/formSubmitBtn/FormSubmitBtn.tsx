import { ReactNode } from 'react';
import './styles/formSubmitBtn-style.css'
type FormSubmitBtnPropType = {
  children: ReactNode;
  disabled?:boolean;

  onClickHandler: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

function FormSubmitBtn({
  onClickHandler,
  children,
  disabled
}: FormSubmitBtnPropType) {
  return (
    <div className='btn__container'>
      <button
        type='submit'
        className='submit__btn'
        onClick={onClickHandler}
        disabled={disabled}
      >
        {children}
      </button>
    </div>
  );
}

export default FormSubmitBtn;
