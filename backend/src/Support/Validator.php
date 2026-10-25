<?php

declare(strict_types=1);

namespace App\Support;

use App\Http\ValidationError;

/**
 * Small rule-based validator. Returns only the declared fields (trimmed and normalised),
 * so unexpected input never reaches the database layer.
 *
 * Rules: required, nullable, string, int, bool, email, phone, date, time, in:a,b,
 *        min:n, max:n (length for strings, value for ints), regex:/.../, same:field
 */
final class Validator
{
    /**
     * @param array<string, mixed> $data
     * @param array<string, string> $rules
     * @param array<string, string> $labels field => human label
     * @return array<string, mixed>
     */
    public static function validate(array $data, array $rules, array $labels = []): array
    {
        $clean = [];
        $errors = [];
        foreach ($rules as $field => $ruleString) {
            $rulesList = self::parse($ruleString);
            $label = $labels[$field] ?? ucfirst(str_replace('_', ' ', $field));
            $value = $data[$field] ?? null;
            if (is_string($value)) {
                $value = trim($value);
            }
            $empty = $value === null || $value === '' || $value === [];

            if ($empty) {
                if (isset($rulesList['required'])) {
                    $errors[$field] = "{$label} is required.";
                } elseif (array_key_exists($field, $data)) {
                    // Absent fields stay absent so PATCH requests only touch what was sent.
                    $clean[$field] = null;
                }
                continue;
            }

            $error = self::check($field, $value, $rulesList, $label, $data);
            if ($error !== null) {
                $errors[$field] = $error;
                continue;
            }
            $clean[$field] = self::cast($value, $rulesList);
        }
        if ($errors) {
            throw new ValidationError($errors);
        }
        return $clean;
    }

    /** @return array<string, string> */
    private static function parse(string $rules): array
    {
        $out = [];
        // regex rules may contain '|' so split carefully: regex must be last.
        if (preg_match('/\|?regex:(.+)$/', $rules, $m)) {
            $out['regex'] = $m[1];
            $rules = substr($rules, 0, -strlen($m[0]));
        }
        foreach (array_filter(explode('|', $rules)) as $rule) {
            [$name, $arg] = array_pad(explode(':', $rule, 2), 2, '');
            $out[$name] = $arg;
        }
        return $out;
    }

    /**
     * @param array<string, string> $r
     * @param array<string, mixed> $data
     */
    private static function check(string $field, mixed $value, array $r, string $label, array $data): ?string
    {
        if (isset($r['int'])) {
            if (!is_int($value) && !(is_string($value) && preg_match('/^-?\d+$/', $value))) {
                return "{$label} must be a whole number.";
            }
            $n = (int) $value;
            if (isset($r['min']) && $n < (int) $r['min']) {
                return "{$label} must be at least {$r['min']}.";
            }
            if (isset($r['max']) && $n > (int) $r['max']) {
                return "{$label} must be at most {$r['max']}.";
            }
            return self::checkIn($value, $r, $label);
        }
        if (isset($r['bool'])) {
            return in_array($value, [true, false, 0, 1, '0', '1', 'true', 'false'], true) ? null : "{$label} must be yes or no.";
        }
        if (!is_string($value)) {
            return "{$label} must be text.";
        }
        $len = mb_strlen($value);
        if (isset($r['min']) && $len < (int) $r['min']) {
            return "{$label} must be at least {$r['min']} characters.";
        }
        if (isset($r['max']) && $len > (int) $r['max']) {
            return "{$label} must be at most {$r['max']} characters.";
        }
        if (isset($r['email']) && (!filter_var($value, FILTER_VALIDATE_EMAIL) || $len > 191)) {
            return 'Enter a valid email address.';
        }
        if (isset($r['phone']) && !preg_match('/^(\+?234|0)[789][01]\d{8}$|^\+[1-9]\d{7,14}$/', preg_replace('/[\s\-()]/', '', $value))) {
            return 'Enter a valid phone number, e.g. 0803 123 4567 or +234 803 123 4567.';
        }
        if (isset($r['date'])) {
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            if (!$d || $d->format('Y-m-d') !== $value) {
                return "{$label} must be a valid date.";
            }
        }
        if (isset($r['time']) && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) {
            return "{$label} must be a valid time (HH:MM).";
        }
        if (isset($r['regex']) && !preg_match($r['regex'], $value)) {
            return "{$label} has an invalid format.";
        }
        if (isset($r['same']) && ($data[$r['same']] ?? null) !== $value) {
            return "{$label} does not match.";
        }
        return self::checkIn($value, $r, $label);
    }

    /** @param array<string, string> $r */
    private static function checkIn(mixed $value, array $r, string $label): ?string
    {
        if (isset($r['in']) && !in_array((string) $value, explode(',', $r['in']), true)) {
            return "{$label} is not a valid option.";
        }
        return null;
    }

    /** @param array<string, string> $r */
    private static function cast(mixed $value, array $r): mixed
    {
        if (isset($r['int'])) {
            return (int) $value;
        }
        if (isset($r['bool'])) {
            return in_array($value, [true, 1, '1', 'true'], true);
        }
        if (isset($r['email'])) {
            return mb_strtolower($value);
        }
        if (isset($r['phone'])) {
            return self::normalisePhone($value);
        }
        return $value;
    }

    /** Store Nigerian numbers in +234 form so lookups and anti-abuse checks match. */
    public static function normalisePhone(string $phone): string
    {
        $digits = preg_replace('/[\s\-()]/', '', $phone);
        if (preg_match('/^0([789][01]\d{8})$/', $digits, $m)) {
            return '+234' . $m[1];
        }
        if (preg_match('/^234([789][01]\d{8})$/', $digits, $m)) {
            return '+234' . $m[1];
        }
        return $digits;
    }
}
