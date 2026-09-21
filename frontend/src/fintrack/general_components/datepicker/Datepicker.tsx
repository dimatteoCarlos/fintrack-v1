import React from 'react';
import DatePicker from 'react-datepicker';
import './styles/datepicker-styles.css';
import 'react-datepicker/dist/react-datepicker.css';

import { VariantType } from '../../types/types';

type DatePickerProps = {
  date: Date;
  changeDate: (selectedDate: Date) => void;
  variant?: VariantType;
  popperClassName?: string;
  // Earliest and latest day the calendar offers; each defaults to the 1900 and
  // 2100 bounds below.
  minDate?: Date;
  maxDate?: Date;
  // The element that opens the calendar; defaults to the read-only text input below.
  customInput?: React.ReactElement;
  // Centred calendar detached from the trigger, for callers whose panel clips it. Needs both props:
  // withPortal alone renders in place, where position: fixed resolves against a transformed ancestor;
  // only portalId moves it to document.body.
  withPortal?: boolean;
  portalId?: string;
};

const DATE_FORMAT = 'dd/MMM/yyyy';

const MIN_DATE = new Date(1900, 0, 1);
const MAX_DATE = new Date(2100, 0, 1);

// react-datepicker recommends forwardRef to avoid focus problems.
const ReadOnlyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => {
  return (
    <input
      {...props}
      ref={ref}
      readOnly
      inputMode='none'
      onPaste={(e) => e.preventDefault()}
    />
  );
});
function Datepicker({
  date,
  changeDate,
  variant,
  popperClassName,
  minDate,
  maxDate,
  customInput,
  withPortal,
  portalId,
}: DatePickerProps) {
  const handleChange = React.useCallback(
    (selectedDate: Date | null) => {
      if (!selectedDate) return;

      changeDate(selectedDate);
    },

    [changeDate],
  );

  return (
    <DatePicker
      selected={date}
      onChange={handleChange}
      showYearDropdown
      scrollableYearDropdown
      yearDropdownItemNumber={5}

      placeholderText='DD/MM/YYYY'
      dateFormat={DATE_FORMAT}
      minDate={minDate ?? MIN_DATE}
      maxDate={maxDate ?? MAX_DATE}
      shouldCloseOnSelect
      customInput={customInput ?? <ReadOnlyInput />}
      withPortal={withPortal}
      portalId={portalId}
      popperClassName={popperClassName}
      className={
        variant == 'tracker' || variant == 'light'
          ? 'tracker__inside__datepicker'
          : 'form__inside__datepicker'
      }
    />
  );
}

// Named constant, not an anonymous export, so fast refresh works (react-refresh/only-export-components).

const MemoizedDatepicker = React.memo(Datepicker);

MemoizedDatepicker.displayName = 'Datepicker';

export default MemoizedDatepicker;
