import { DictionaryDataType } from "../../../../utils/languages.ts";

import './proceedButtonUI.css';

type ProceedButtonUIPropsType = {
  onClick: () => void;
  disabled?: boolean;
  // Filled red marks the screen's main destructive action (CLOSE). This route,
  // offered only while a balance blocks the close, is outlined so two filled red
  // buttons do not compete. Defaults to primary.
  variant?: 'primary' | 'secondary';
  t:(keyText:keyof DictionaryDataType)=>string;
};
const ProceedButtonUI = ({onClick,
disabled, variant = 'primary', t}:ProceedButtonUIPropsType) => {

 return (
  <button className={
    variant === 'secondary'
     ? 'proceed-button proceed-button--secondary'
     : 'proceed-button'
   }
    onClick={onClick}
    disabled={disabled}
    aria-label={t('proceedToDeletionButton')}
  >
   {t('proceedToDeletionButton')}

  </button>
 )
}

export default ProceedButtonUI