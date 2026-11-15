'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import { type FieldValues, type Path, type UseFormReturn, useWatch } from 'react-hook-form';
import { FieldPair, TextField, useFieldErrorText } from '../../forms';
import { MapPicker } from '../../map/map-picker';
import { pointFromFields } from '../../map/map-model';
import { asOptionalNumber } from './parts';

type PointErrors = { message?: string; lng?: { message?: string }; lat?: { message?: string } };

/**
 * A point as longitude and latitude fields with the map picker beside them (FR-DAT-03 area
 * centers, FR-DAT-04 project locations). Both ways write the same two fields: a click on the map
 * fills them, and typing moves the marker. The fields are the keyboard way (NFR-14) and keep
 * working when the map cannot load.
 */
export function LocationFields<T extends FieldValues, U>({
  form,
  name,
  legend,
  hint,
  lngLabel,
  latLabel,
  mapLabel,
  disabled = false,
}: {
  form: UseFormReturn<T, unknown, U>;
  /** The object field holding { lng, lat }: center or location. */
  name: string;
  legend: ReactNode;
  hint: ReactNode;
  lngLabel: ReactNode;
  latLabel: ReactNode;
  mapLabel: string;
  disabled?: boolean;
}) {
  const id = useId();
  const fieldError = useFieldErrorText();
  const lngName = `${name}.lng` as Path<T>;
  const latName = `${name}.lat` as Path<T>;
  const [lng, lat] = useWatch({ control: form.control, name: [lngName, latName] }) as unknown[];
  const errors = (form.formState.errors as Record<string, PointErrors | undefined>)[name];
  const error = errors?.message;
  const register = form.register as unknown as (
    field: string,
    options?: { setValueAs?: (value: unknown) => unknown },
  ) => ReturnType<typeof form.register>;

  return (
    <fieldset
      className="reih-field reih-location"
      data-invalid={error ? 'true' : undefined}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
    >
      <legend>{legend}</legend>
      <p id={`${id}-hint`} className="reih-hint">
        {hint}
      </p>
      <FieldPair>
        <TextField
          label={lngLabel}
          type="number"
          step="any"
          inputMode="decimal"
          dir="ltr"
          error={fieldError(errors?.lng?.message)}
          {...register(lngName, { setValueAs: asOptionalNumber })}
        />
        <TextField
          label={latLabel}
          type="number"
          step="any"
          inputMode="decimal"
          dir="ltr"
          error={fieldError(errors?.lat?.message)}
          {...register(latName, { setValueAs: asOptionalNumber })}
        />
      </FieldPair>
      {error && (
        <p id={`${id}-error`} className="reih-field-error">
          {fieldError(error)}
        </p>
      )}
      <MapPicker
        label={mapLabel}
        value={pointFromFields(lng, lat)}
        disabled={disabled}
        onPick={(point) => {
          const options = {
            shouldDirty: true,
            shouldValidate: form.formState.submitCount > 0,
          } as const;
          form.setValue(lngName, point.lng as never, options);
          form.setValue(latName, point.lat as never, options);
        }}
      />
    </fieldset>
  );
}
