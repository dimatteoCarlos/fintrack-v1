import { DictionaryDataType } from '../../../../utils/languages';
import './impactReportUI.css';

type NoImpactReportUIPropsType = {
  // Selects the empty-result wording: the annulment's ("no account would be
  // adjusted") when true, the close's ("no account shares movements with this
  // one") when false.
  isProjectionShown?: boolean;
  t: (keyText:keyof DictionaryDataType)=>string;
};

export const NoImpactReportUI: React.FC<NoImpactReportUIPropsType> = ({
  isProjectionShown = true,
  t,
}: NoImpactReportUIPropsType) => {
  
  return (
    <div className="no-impact-report">
      <p className="no-impact-title">
        {t(isProjectionShown ? 'noImpactTitle' : 'relatedAccountsNoneTitle')}
      </p>
      <p className="no-impact-message">
        {t(
          isProjectionShown ? 'noImpactMessage' : 'relatedAccountsNoneMessage',
        ).replace(/\*\*/g, '')}
      </p>
    </div>
  );
};
