import { Injectable } from '@nestjs/common';

interface Condition {
  field: string;
  operator: string;
  value: unknown;
}

interface ConditionGroup {
  operator: 'AND' | 'OR';
  conditions: (Condition | ConditionGroup)[];
}

@Injectable()
export class ConditionEvaluator {
  evaluate(conditions: unknown, payload: Record<string, unknown>): boolean {
    if (!conditions) return true;

    if (this.isConditionGroup(conditions)) {
      return this.evaluateGroup(conditions, payload);
    }

    if (this.isCondition(conditions)) {
      return this.evaluateSingle(conditions, payload);
    }

    return true;
  }

  private evaluateGroup(group: ConditionGroup, payload: Record<string, unknown>): boolean {
    if (!group.conditions || group.conditions.length === 0) return true;

    if (group.operator === 'OR') {
      return group.conditions.some((c) => this.evaluate(c, payload));
    }
    return group.conditions.every((c) => this.evaluate(c, payload));
  }

  private evaluateSingle(condition: Condition, payload: Record<string, unknown>): boolean {
    const fieldValue = this.resolveField(condition.field, payload);
    const compareValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return String(fieldValue) === String(compareValue);
      case 'not_equals':
        return String(fieldValue) !== String(compareValue);
      case 'contains':
        return String(fieldValue ?? '').toLowerCase().includes(String(compareValue ?? '').toLowerCase());
      case 'greater_than':
        return Number(fieldValue) > Number(compareValue);
      case 'less_than':
        return Number(fieldValue) < Number(compareValue);
      case 'in': {
        const list = String(compareValue).split(',').map((s) => s.trim());
        return list.includes(String(fieldValue));
      }
      case 'not_in': {
        const list = String(compareValue).split(',').map((s) => s.trim());
        return !list.includes(String(fieldValue));
      }
      case 'is_empty':
        return fieldValue === null || fieldValue === undefined || fieldValue === '';
      case 'is_not_empty':
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
      case 'starts_with':
        return String(fieldValue ?? '').startsWith(String(compareValue ?? ''));
      case 'ends_with':
        return String(fieldValue ?? '').endsWith(String(compareValue ?? ''));
      case 'regex': {
        try {
          const pattern = String(compareValue);
          if (pattern.length > 200) return false;
          const re = new RegExp(pattern, 'i');
          const input = String(fieldValue ?? '').slice(0, 10_000);
          return re.test(input);
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  }

  private resolveField(path: string, payload: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = payload;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private isConditionGroup(c: unknown): c is ConditionGroup {
    return typeof c === 'object' && c !== null && 'operator' in c && 'conditions' in c;
  }

  private isCondition(c: unknown): c is Condition {
    return typeof c === 'object' && c !== null && 'field' in c && 'operator' in c;
  }
}
