/**
 * 题目卡片(5 种题型合一)
 *
 * 设计:
 *  - 内部维护「选中态/输入态」, 通过 value 属性双向同步, change 事件向外抛
 *  - readonly 模式给「结果页」展示用
 *  - 多选用 string[]; 单选用 string[](长度 1) 与多选一致, 简化校验
 *  - judge 用 boolean
 *  - fill / short_answer 用 string
 */

import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from '../../config/constants';
import type { Question } from '../../types/domain';

type AnswerValue = string[] | boolean | string | null;

Component({
  options: { addGlobalClass: true },
  properties: {
    question: {
      type: Object,
      value: null as Question | null,
    },
    value: {
      type: null,
      value: null as AnswerValue,
    },
    readonly: {
      type: Boolean,
      value: false,
    },
    showHead: {
      type: Boolean,
      value: true,
    },
    showOrder: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    selectedMap: {} as Record<string, boolean>,
    selectedJudge: null as boolean | null,
    textValue: '',
    typeLabel: '',
    difficultyLabel: '',
  },
  observers: {
    'question,value'(q: Question | null, v: AnswerValue) {
      if (!q) return;
      const data: Partial<{
        selectedMap: Record<string, boolean>;
        selectedJudge: boolean | null;
        textValue: string;
        typeLabel: string;
        difficultyLabel: string;
      }> = {
        typeLabel: QUESTION_TYPE_LABEL[q.type] ?? q.type,
        difficultyLabel: DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty,
      };
      if (q.type === 'single' || q.type === 'multiple') {
        const arr = Array.isArray(v) ? (v as string[]) : [];
        const map: Record<string, boolean> = {};
        arr.forEach((id) => (map[id] = true));
        data.selectedMap = map;
      } else if (q.type === 'judge') {
        data.selectedJudge = typeof v === 'boolean' ? v : null;
      } else {
        data.textValue = typeof v === 'string' ? v : '';
      }
      this.setData(data);
    },
  },
  methods: {
    onSelectOption(e: WechatMiniprogram.BaseEvent) {
      if (this.data.readonly) return;
      const q = this.properties.question as Question | null;
      if (!q) return;
      const id = e.currentTarget.dataset.id as string;
      const map: Record<string, boolean> = { ...this.data.selectedMap };
      if (q.type === 'single') {
        const next = map[id] ? {} : { [id]: true };
        this.setData({ selectedMap: next });
        this.triggerEvent('change', { value: Object.keys(next) });
      } else {
        if (map[id]) delete map[id];
        else map[id] = true;
        this.setData({ selectedMap: map });
        this.triggerEvent('change', { value: Object.keys(map) });
      }
    },
    onSelectJudge(e: WechatMiniprogram.BaseEvent) {
      if (this.data.readonly) return;
      const v = e.currentTarget.dataset.v === 'true';
      this.setData({ selectedJudge: v });
      this.triggerEvent('change', { value: v });
    },
    onTextInput(e: WechatMiniprogram.Input) {
      const v = e.detail.value;
      this.setData({ textValue: v });
      this.triggerEvent('change', { value: v });
    },
  },
});
