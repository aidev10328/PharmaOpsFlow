'use client';

import React, { useState } from 'react';

type PasswordInputProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  minLength?: number;
  id?: string;
  autoComplete?: string;
};

export default function PasswordInput({
  value,
  onChange,
  placeholder = '',
  className = 'input-field',
  required = false,
  minLength,
  id,
  autoComplete,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${className} pr-16`}
        required={required}
        minLength={minLength}
        id={id}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 font-medium px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
        tabIndex={-1}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
