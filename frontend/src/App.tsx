import React, { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { Slide, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import ProtectedRoute from './auth/components/protectedRoute/ProtectedRoute';
import PublicOnlyRoute from './auth/components/publicOnlyRoute/PublicOnlyRoute';
import AuthPage from './auth/components/authPage/AuthPage';

import Layout from './fintrack/pages/layout/Layout';
import TrackerLayout from './fintrack/pages/tracker/TrackerLayout';

import Expense from './fintrack/pages/tracker/expense/Expense';
import Income from './fintrack/pages/tracker/income/Income';
import Transfer from './fintrack/pages/tracker/transfer/Transfer';
import Debts from './fintrack/pages/tracker/debts/Debts';
import PnL from './fintrack/pages/tracker/profitNloss/PnL';

import BudgetLayout from './fintrack/pages/budget/BudgetLayout';

import PocketLayout from './fintrack/pages/pocket/PocketLayout';

import DebtsLayout from './fintrack/pages/debts/DebtsLayout';

// Layouts and tracker pages are imported eagerly; the other pages load on first visit.
const Budget = lazy(() => import('./fintrack/pages/budget/Budget'));

// Lazy so a chart nobody has asked for yet does not weigh on the module's first paint.
const BudgetVariance = lazy(
  () => import('./fintrack/pages/budget/BudgetVariance'),
);
const Pocket = lazy(() => import('./fintrack/pages/pocket/Pocket'));
const Debtors = lazy(() => import('./fintrack/pages/debts/Debtors'));

import OverviewLayout from './fintrack/pages/overview/OverviewLayout';

const Overview = lazy(() => import('./fintrack/pages/overview/Overview'));

// Overview level 2: one domain, loaded when a card is opened.
const OverviewDomain = lazy(
  () => import('./fintrack/pages/overview/OverviewDomain')
);

const AccountingDashboard = lazy(
  () => import('./fintrack/pages/accountingDashboard/AccountingDashboard'),
);

const NewCategory = lazy(
  () => import('./fintrack/pages/forms/newCategory/NewCategory'),
);
const NewPocket = lazy(
  () => import('./fintrack/pages/forms/newPocket/NewPocket'),
);
const EditPocket = lazy(
  () => import('./fintrack/pages/forms/editPocket/EditPocket'),
);
const NewProfile = lazy(
  () => import('./fintrack/pages/forms/newProfile/NewProfile'),
);
const NewAccount = lazy(
  () => import('./fintrack/pages/forms/newAccount/NewAccount'),
);

const AccountDetail = lazy(
  () => import('./fintrack/pages/forms/accountDetail/AccountDetail'),
);
// Overview's leaner AccountDetail without the record card; AccountDetail itself
// stays Accounting Dashboard's.
const OverviewAccountReading = lazy(
  () => import('./fintrack/pages/forms/accountDetail/OverviewAccountReading'),
);
const DebtorDetail = lazy(
  () => import('./fintrack/pages/forms/debtorDetail/DebtorDetail'),
);
// Debts' leaner DebtorDetail without the record card; DebtorDetail itself stays
// Accounting Dashboard's.
const DebtorDetailReading = lazy(
  () => import('./fintrack/pages/forms/debtorDetail/DebtorDetailReading'),
);
const PocketDetail = lazy(
  () => import('./fintrack/pages/forms/pocketDetail/PocketDetail'),
);
const CategoryAccountList = lazy(
  () => import('./fintrack/pages/forms/categoryDetail/CategoryAccountList'),
);
const CategoryDetail = lazy(
  () => import('./fintrack/pages/forms/categoryDetail/CategoryDetail'),
);
// Budget's leaner CategoryDetail without the record card; CategoryDetail itself
// stays Accounting Dashboard's.
const CategoryDetailReading = lazy(
  () => import('./fintrack/pages/forms/categoryDetail/CategoryDetailReading'),
);

const EditAccount = lazy(
  () =>
    import('./fintrack/editionAndDeletion/pages/editionAccount/EditAccount'),
);

const AccountDeletionPage = lazy(
  () =>
    import('./fintrack/editionAndDeletion/pages/deletionAccount/AccountDeletionPage'),
);

// Reached from the profile menu, not the accounting dashboard: a closed
// account's row is removed, so only its registry stamp survives.
const ClosedAccountsPage = lazy(
  () =>
    import('./fintrack/editionAndDeletion/pages/closedAccounts/ClosedAccountsPage'),
);

import ErrorPage from './fintrack/pages/error/ErrorPage';

import { AUTH_ROUTE } from './auth/auth_constants/constants';

import CircleLoader from './fintrack/loader/circleLoader/CircleLoader';

const PageLoader = () => (
  <div className='flex justify-center items-center min-h-screen'>
    <CircleLoader />
  </div>
);

const LazyRoute = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

function App() {
  const router = createBrowserRouter([
    // Behind the guard so a signed-in owner never lands on the login form, e.g.
    // via the back button out of the tracker.
    {
      path: '/',
      element: <PublicOnlyRoute />,
      children: [{ index: true, element: <AuthPage /> }],
    },

    {
      path: AUTH_ROUTE,
      element: <AuthPage />,
    },

    {
      path: '/fintrack',
      element: <ProtectedRoute />,
      children: [
        {
          path: '',
          element: <Layout />,
          errorElement: <ErrorPage />,

          children: [
            {
              index: true,
              element: (
                <Navigate
                  to='tracker/expense'
                  replace
                />
              ),
            },
            {
              path: 'tracker',
              element: <TrackerLayout />,
              children: [
                { index: true, element: <Expense /> },
                { path: 'expense', element: <Expense /> },
                { path: 'income', element: <Income /> },
                { path: 'transfer', element: <Transfer /> },
                { path: 'pnl', element: <PnL /> },
                { path: 'debts', element: <Debts /> },
              ],
            },

            {
              path: 'budget',
              element: <BudgetLayout />,
              children: [
                {
                  index: true,
                  element: (
                    <LazyRoute>
                      <Budget />
                    </LazyRoute>
                  ),
                },
                // A sibling of the list, not a screen of its own: BudgetLayout renders
                // the month board above, so the variance is read against those totals.
                {
                  path: 'variance',
                  element: (
                    <LazyRoute>
                      <BudgetVariance />
                    </LazyRoute>
                  ),
                },
                // Same component, drilled: with a category in the path it ranks its subcategories.
                // A sibling route because the charts replace each other; this avoids a month refetch.
                {
                  path: 'variance/:categoryName',
                  element: (
                    <LazyRoute>
                      <BudgetVariance />
                    </LazyRoute>
                  ),
                },
              ],
            },

            {
              path: 'pocket',
              element: <PocketLayout />,
              children: [
                {
                  index: true,
                  element: (
                    <LazyRoute>
                      <Pocket />
                    </LazyRoute>
                  ),
                },
              ],
            },

            {
              path: 'debts',
              element: <DebtsLayout />,
              children: [
                // One canonical debts URL: every control under the board is built for
                // /fintrack/debts/debtors.
                {
                  index: true,
                  element: <Navigate to='debtors' replace />,
                },
                {
                  path: 'debtors',
                  element: (
                    <LazyRoute>
                      <Debtors />
                    </LazyRoute>
                  ),
                },
              ],
            },

            {
              path: 'overview',
              element: <OverviewLayout />,
              children: [
                {
                  index: true,
                  element: (
                    <LazyRoute>
                      <Overview />
                    </LazyRoute>
                  ),
                },
                // Sibling of the index so the month picker, hero and ?month= are shared (a separate route
                // would own the month twice). :domain is validated in the page: a router cannot know the six
                // names the controller supports, and other segments get a screen listing them, not a 400.
                {
                  path: ':domain',
                  element: (
                    <LazyRoute>
                      <OverviewDomain />
                    </LazyRoute>
                  ),
                },
              ],
            },
          ],
        },

        {
          path: 'tracker/accounting',
          element: (
            <LazyRoute>
              <AccountingDashboard />
            </LazyRoute>
          ),
        },

        {
          path: 'budget/new_category',
          element: (
            <LazyRoute>
              <NewCategory />
            </LazyRoute>
          ),
        },

        {
          path: 'pocket/new_pocket',
          element: (
            <LazyRoute>
              <NewPocket />
            </LazyRoute>
          ),
        },

        {
          path: 'debts/debtors/new_profile',
          element: (
            <LazyRoute>
              <NewProfile />
            </LazyRoute>
          ),
        },

        {
          path: 'overview/new_account',
          element: (
            <LazyRoute>
              <NewAccount />
            </LazyRoute>
          ),
        },

        {
          path: 'overview/accounts/:accountId',
          element: (
            <LazyRoute>
              <AccountDetail />
            </LazyRoute>
          ),
        },

        // Overview's own leaner route to the account: a new path, since the one
        // above also serves Accounting Dashboard.
        {
          path: 'overview/account/:accountId',
          element: (
            <LazyRoute>
              <OverviewAccountReading />
            </LazyRoute>
          ),
        },

        {
          path: 'debts/debtors/:debtorId',
          element: (
            <LazyRoute>
              <DebtorDetail />
            </LazyRoute>
          ),
        },

        // Debts' own leaner route to the debtor: a new path, since the one above
        // also serves Accounting Dashboard.
        {
          path: 'debts/debtor/:debtorId',
          element: (
            <LazyRoute>
              <DebtorDetailReading />
            </LazyRoute>
          ),
        },
        {
          path: 'pocket/pockets/:pocketId',
          element: (
            <LazyRoute>
              <PocketDetail />
            </LazyRoute>
          ),
        },

        // Beside the detail so opening the editor unmounts the card underneath. Commit and release cash
        // are modals instead: their responses carry the whole detail payload, which repaints the card.
        {
          path: 'pocket/pockets/:pocketId/edit',
          element: (
            <LazyRoute>
              <EditPocket />
            </LazyRoute>
          ),
        },

        {
          path: 'budget/category/:categoryName',
          element: (
            <LazyRoute>
              <CategoryAccountList />
            </LazyRoute>
          ),
        },

        {
          // Budget's own leaner route; already distinct from Accounting
          // Dashboard's by the categoryName segment.
          path: 'budget/category/:categoryName/account/:accountId',
          element: (
            <LazyRoute>
              <CategoryDetailReading />
            </LazyRoute>
          ),
        },

        // Accounting Dashboard's category detail.
        {
          path: 'budget/account/:accountId',
          element: (
            <LazyRoute>
              <CategoryDetail />
            </LazyRoute>
          ),
        },

        {
          path: 'account/:accountId/edit',
          element: (
            <LazyRoute>
              <EditAccount />
            </LazyRoute>
          ),
        },

        {
          path: 'account/:accountId/delete',
          element: (
            <LazyRoute>
              <AccountDeletionPage />
            </LazyRoute>
          ),
        },

        // Two segments, so single-segment 'account/:accountId' patterns cannot
        // swallow it - the same reason the delete route works.
        {
          path: 'account/closed',
          element: (
            <LazyRoute>
              <ClosedAccountsPage />
            </LazyRoute>
          ),
        },
      ],
    },
  ]);
  return (
    <>
      <RouterProvider router={router} />

      <ToastContainer
        position='bottom-center'
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick={false}
        // Explicit rather than the library default: a toast that outlasts its
        // autoClose (an error, given its longer duration) must still be
        // dismissable by hand.
        closeButton={true}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        transition={Slide}
      />
    </>
  );
}

export default App;
