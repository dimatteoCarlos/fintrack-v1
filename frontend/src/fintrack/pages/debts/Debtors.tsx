import { NavigateFunction, useLocation, useNavigate } from 'react-router-dom';
import { CardTitle } from '../../general_components/CardTitle';
import OpenAddEditBtn from '../../general_components/OpenAddEditBtn';
import ListOfDebtors from './components/ListOfDebtors';
import ExportMenu from '../../general_components/exportMenu/ExportMenu';
import { downloadDebtExport } from '../../api/exportApi';

// The form has one declared route, so the destination is the route itself; a path appended to the
// current pathname existed from only one of the two debts URLs.
const NEW_DEBTOR_ROUTE = '/fintrack/debts/debtors/new_profile';

function Debtors() {
  const originRoute = useLocation().pathname;
  const navigateTo: NavigateFunction = useNavigate();

  // The origin travels in state because it is where the form returns to, not where it lives.
  const createNewProfile = (originRoute: string) => {
    navigateTo(NEW_DEBTOR_ROUTE, {
      state: { previousRoute: originRoute },
      viewTransition: true,
    });
  };

  return (
    <>
      <section className='content__presentation'>
        <div className='debts cards__presentation '>
          <OpenAddEditBtn
            btnFunction={createNewProfile}
            btnFunctionArg={originRoute}
            btnPreviousRoute={originRoute}
          >
            <div className='open__btn__label'>New Debtor</div>
          </OpenAddEditBtn>

          {/* The row is this wrapper's job, not CardTitle's: it titles twelve screens, and a menu passed
              as its `legend` would render a <ul> inside the heading. No month is sent: this module has
              no month control, so the server resolves it. */}
          <div className='debtsSummaryBar'>
            <CardTitle>Summary</CardTitle>

            <ExportMenu
              subject='the debtor list'
              surface='dark'
              onExport={(format) => downloadDebtExport({ format })}
            />
          </div>

          <ListOfDebtors
            previousRoute={originRoute}
            accountType={'debtor'}
          ></ListOfDebtors>
        </div>
      </section>
    </>
  );
}

export default Debtors;
