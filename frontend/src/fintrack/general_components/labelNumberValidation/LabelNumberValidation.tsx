import { capitalize } from '../../helpers/functions';
import { VariantType } from '../../types/types';
import { ValidationMessagesType } from '../../validations/types';

type LabelNumberValidationPropType<
  TFormDataType extends { [key: string]: unknown },
> = {
  formDataNumber: { [key: string]: string };
  validationMessages: ValidationMessagesType<TFormDataType>;
  variant: VariantType;
};

function LabelNumberValidation<
  TFormDataType extends { [key: string]: unknown },
>({
  formDataNumber,
  validationMessages,
  variant,
}: LabelNumberValidationPropType<TFormDataType>) {
  const labelClassName =
    variant === 'form' ? 'label forms__label' : 'card--title';

  const validationKey = formDataNumber.keyName as keyof TFormDataType;
  const validationMessage = validationMessages[validationKey] || '';

  // A 'Format:' prefix means the figure was ACCEPTED, so this one span says two
  // opposite things. The class states which, letting the stylesheet pick the
  // colour for the surface: forms are dark and the tracker card is light.
  const isAcceptedFormat = validationMessage.toLowerCase().includes('format:');

  return (
    // A label, not a div; htmlFor is the field's own key, which names the amount
    // input everywhere this renders, so the two cannot drift.
    <label className={labelClassName} htmlFor={String(validationKey)}>
      {capitalize(formDataNumber.title)}&nbsp;
      {/* Named so the field can point at it with aria-describedby; without the id
          the message is a loose sibling and a screen reader announces nothing
          wrong. The id derives from the field's key, like the input's. */}
      <span
        id={`${String(validationKey)}-validation`}
        className={`validation__errMsg${
          isAcceptedFormat ? ' validation__errMsg--ok' : ''
        }`}
      >
        {validationMessages[
          formDataNumber.keyName as keyof TFormDataType
        ]?.replace('Format:', '')}
      </span>
    </label>
  );
}

export default LabelNumberValidation;
