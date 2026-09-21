import { ReactNode } from 'react';

type OpenAddEditBtnPropType = {
  children: ReactNode;
  btnFunction: (btnFunctionArg: string) => void;
  btnFunctionArg: string;
  btnPreviousRoute?: string;
};

function OpenAddEditBtn({
  children,
  btnFunction,
  btnFunctionArg,
}: OpenAddEditBtnPropType): JSX.Element {
  function onClickHandler() {
    btnFunction(btnFunctionArg);

  }

  return (
    <button
      className='line__container flx-row-jc add__edit__btn'
      onClick={onClickHandler}
    >
      {children}
    </button>
  );
}

export default OpenAddEditBtn;
