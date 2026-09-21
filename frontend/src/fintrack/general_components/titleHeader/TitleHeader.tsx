import { Link, useLocation } from 'react-router-dom';
import LeftArrowDarkSvg from '../../../assets/LeftArrowDarkSvg.svg';
import './titleHeader-style.css';
import { PAGE_LOC_NUM } from '../../helpers/constants.ts';

// The title is the main route name.
export function TitleHeader() {
  const location = useLocation();
  const currentRoute = location.pathname.split('/')[PAGE_LOC_NUM - 1];

  return (
    <>
      <div className='title__header__container'>
        {/* The link contains only an icon, so aria-label gives it an accessible name. */}
        <Link
          to={'..'}
          relative='path'
          className='backArrow backArrow--light'
          aria-label='Go back'
        >
          <LeftArrowDarkSvg aria-hidden='true' />
        </Link>

        {/* h1: the screen's only page-level heading; the styles select the class,
            so the tag does not change the appearance. */}
        <h1 className='title__header'>{currentRoute}</h1>
      </div>
    </>
  );
}
