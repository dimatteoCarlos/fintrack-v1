import Select, {
  components,
  DropdownIndicatorProps,
  GroupBase,
  StylesConfig,
  SelectInstance,
  SingleValue,
  MultiValue,
} from 'react-select';
import { useEffect, useRef } from 'react';
import ArrowDownDarkSvg from '../../../assets/ArrowDownDarkSvg.svg';
import ArrowDownLightSvg from '../../../assets/ArrowDownLightSvg.svg';
import { DropdownOptionType, VariantType } from '../../types/types';

export type DropdownSelectPropType = {
  dropDownOptions: {
    title: string;
    options: DropdownOptionType[];
    variant: VariantType;
  };

  updateOptionHandler: (selectedOption: DropdownOptionType | null) => void;

  // The control's accessible name. A placeholder is not one: react-select erases
  // it once a value is chosen. Falls back to the placeholder text, so a caller
  // passes this only when two dropdowns on one screen would otherwise read alike.
  ariaLabel?: string;

  setIsReset: (value: boolean) => void;
  isReset: boolean;

  setIsResetDropdown?: (value: boolean) => void;
  isResetDropdown?: boolean;
};

const createDropdownIndicator =
  (variant: VariantType) =>
  (
    props: DropdownIndicatorProps<
      DropdownOptionType,
      false,
      GroupBase<DropdownOptionType>
    >,
  ) => (
    <components.DropdownIndicator {...props}>
      {variant === 'tracker' ? <ArrowDownDarkSvg /> : <ArrowDownLightSvg />}
    </components.DropdownIndicator>
  );

const createStyles = (
  variant: VariantType,
): StylesConfig<DropdownOptionType, false, GroupBase<DropdownOptionType>> => ({
  container: (baseStyles) => ({
    ...baseStyles,
    boxShadow: 'none',
    width: '100%',
    border: 'none',
    borderRadius: '0.75rem',
  }),

  control: (base, state) => ({
    ...base,
    backgroundColor: variant === 'tracker' ? '#e8e4da' : 'transparent',
    color: variant === 'tracker' ? 'var(--dark)' : 'var(--light)',
    // Focus ring drawn as a shadow: the border is the library's and changing it
    // shifts the box. Only on focus, so the resting field is unchanged.
    boxShadow: state.isFocused
      ? `0 0 0 var(--border-width-thick) ${
          variant === 'tracker'
            ? 'var(--color-border-strong)'
            : 'var(--color-border-inverse)'
        }`
      : 'none',
    border: variant === 'tracker' ? 'none' : '1px solid var(--light)',
    borderRadius: '1rem',
    fontWeight: '500',
    fontSize: '0.875rem',
    cursor: 'pointer',
    textTransform: 'capitalize' as const,
  }),

  placeholder: (baseStyles) => ({
    ...baseStyles,
    color: variant === 'tracker' ? 'var(--dark)' : 'var(--creme)',
  }),

  menu: (base) => ({
    ...base,
    backgroundColor: variant === 'tracker' ? 'white' : 'var(--dark)',
    color: variant === 'tracker' ? 'var(--dark)' : 'var(--light)',
  }),

  singleValue: (base) => ({
    ...base,
    color: variant === 'tracker' ? 'var(--dark)' : 'var(--creme)',
  }),

  option: (provided, state) =>
    variant === 'tracker'
      ? {
          ...provided,
          backgroundColor: state.isSelected ? '#e8e4da' : 'white',
          color: 'var(--dark)',
          ':active': { backgroundColor: 'transparent' },
          ':hover': { backgroundColor: 'rgba(232, 228, 218 , 0.4)' },
        }
      :
        {
          ...provided,
          backgroundColor: state.isSelected ? 'var(--dark)' : 'transparent',
          color: 'var(--creme)',
          borderRadius: '1rem',
          padding: '0.5rem',
          ':active': { backgroundColor: '#333030' },
          ':hover': { backgroundColor: 'hsla(0, 3.00%, 19.40%, 0.50)' },
        },

  menuPortal: (base) => ({
    ...base,
    zIndex: 9999, // keeps the portalled menu above other layers
  }),

  menuList: (base) => ({
    ...base,
    maxHeight: '360px',
    overflowY: 'auto',
  }),
});
function DropDownSelection({
  dropDownOptions,
  updateOptionHandler,
  ariaLabel,
  isReset,
  isResetDropdown,
  setIsReset,
  setIsResetDropdown,
}: DropdownSelectPropType) {
  const { title, options, variant } = dropDownOptions;
  const selectRef =
    useRef<
      SelectInstance<DropdownOptionType, false, GroupBase<DropdownOptionType>>
    >(null);

  useEffect(() => {
    if ((isReset || isResetDropdown) && selectRef.current) {
      selectRef.current.clearValue();
      setIsReset(false); // the flag belongs to the parent
      if (setIsResetDropdown) {
        setIsResetDropdown(false);
      }
    }
  }, [isReset, isResetDropdown, setIsResetDropdown, setIsReset]);

  const handleChange = (
    newValue: SingleValue<DropdownOptionType> | MultiValue<DropdownOptionType>,
  ) => {
    updateOptionHandler(newValue as SingleValue<DropdownOptionType>);
  };

  return (
    <Select
      options={options}
      onChange={handleChange}
      placeholder={title}
      // The name survives the value; the placeholder does not.
      aria-label={ariaLabel ?? title}
      styles={createStyles(variant)}
      closeMenuOnSelect={true}
      tabSelectsValue={false}
      captureMenuScroll={false}
      isSearchable={true}
      isClearable
      ref={selectRef}
      /* portal + fixed position so ancestors' overflow cannot clip the menu */
      menuPortalTarget={document.body}
      menuPosition='fixed'
      maxMenuHeight={220}
      menuPlacement={variant === 'tracker' ? 'top' : 'bottom'}
      components={{
        DropdownIndicator: createDropdownIndicator(variant), // binds variant; react-select supplies its own props
      }}
    />
  );
}

export default DropDownSelection;
