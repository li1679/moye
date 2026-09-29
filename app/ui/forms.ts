import { $, esc } from '../core/dom';
import { cover, confirmSheetHtml } from '../kit/ui';
import { needBook, nextLibraryOrder } from '../core/library';
import { compressCover } from '../features/covers';
import type { Ctx } from '../core/context';

// 书籍表单、简单输入表单、确认删除弹层、封面选择与表单提交（2.10 从 prototype.js 拆出）。
// 书架（新建/修改/删除书籍、新建/重命名分组）与章节页（删除确认）经组装层从这里注入。
export type Forms = {
  bookForm(edit?: boolean): void;
  inputForm(title: string, label: string, action: string, value?: string): void;
  confirmSheet(title: string, message: string, action: string): void;
  install(): void;
};

export function createForms(ctx: Ctx): Forms {
  const state = ctx.state;
  // 正在编辑的书籍表单所选的封面；提交时随表单一起写入。
  let formImage: string | undefined;

  function bookForm(edit = false) {
    const b = edit ? needBook(state) : { name: "", author: "", description: "", image: undefined };
    formImage = b.image || undefined;
    ctx.openSheet(
      edit ? "修改书籍信息" : "新建书籍",
      `<form id="book-form" data-edit="${edit}"><button class="cover-picker" type="button" data-action="choose-cover">${cover({ ...b, name: b.name || "书名" })}<span>选择封面</span></button><input type="file" id="cover-file" accept="image/*" hidden><label class="form-field"><span>书名</span><input id="book-name" required maxlength="40" placeholder="点击输入书名（必填）" value="${esc(b.name)}"></label><label class="form-field"><span>作者</span><input id="book-author" maxlength="40" placeholder="点击输入作者名（可选）" value="${esc(b.author)}"></label><label class="form-field"><span>简介</span><textarea id="book-description" maxlength="600" placeholder="点击输入简介（可选）">${esc(b.description || "")}</textarea></label><div class="error" id="form-error"></div><button class="primary" type="submit">${edit ? "完成" : "创建"}</button></form>`,
    );
  }

  function inputForm(title: string, label: string, action: string, value = "") {
    ctx.openSheet(
      title,
      `<form id="simple-form" data-kind="${action}"><label class="form-field"><span>${label}</span><input id="simple-value" required maxlength="80" value="${esc(value)}" placeholder="${label}" autofocus></label><button class="primary">确定</button></form>`,
    );
    $<HTMLInputElement>('#simple-value').focus();
  }

  function confirmSheet(title: string, message: string, action: string) {
    ctx.openSheet(title, confirmSheetHtml(message, action));
  }

  // 封面选择与两个表单的提交处理。
  function install() {
    document.addEventListener("change", async (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const el = e.target;
      const file = el.files?.[0];
      if (el.id !== "cover-file" || !file) return;
      if (!file.type.startsWith("image/")) {
        ctx.toast("请选择图片文件");
        return;
      }
      const submit = $<HTMLButtonElement>('#book-form button[type="submit"]');
      submit.disabled = true;   // 压缩期间提交按钮是禁用的
      try {
        formImage = await compressCover(file);
        $(".cover-picker .cover").classList.add("has-image");
        $(".cover-picker .cover").innerHTML = `<img src="${formImage}" alt="封面预览">`;
      } catch {
        ctx.toast("无法读取这张图片，请换一张");
      } finally {
        submit.disabled = false;
      }
    });
    document.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!(e.target instanceof HTMLFormElement)) return;
      const f = e.target;
      if (f.id === "book-form") {
        const name = $<HTMLInputElement>("#book-name").value.trim();
        if (!name) {
          $("#form-error").textContent = "书名不能为空";
          return;
        }
        const values = {
          name,
          author: $<HTMLInputElement>("#book-author").value.trim(),
          description: $<HTMLTextAreaElement>("#book-description").value.trim(),
          image: formImage,
        };
        if (f.dataset.edit === "true") {
          Object.assign(needBook(state), values);
        } else {
          const created = {
            ...values,
            id: Date.now(),
            group: state.folder,
            libraryOrder: nextLibraryOrder(state, state.folder),
            chapters: [],
          };
          state.books.push(created);
          state.book = created.id;
          state.chapter = 0;
          state.page = 'chapters';
        }
        ctx.closeSheet();
        ctx.render();
      }
      if (f.id === "simple-form") {
        const value = $<HTMLInputElement>("#simple-value").value.trim();
        if (!value) return;
        const kind = f.dataset.kind;
        if (kind === "group") state.groups.push({ id: Date.now(), name: value, libraryOrder: nextLibraryOrder(state, null) });
        if (kind === "rename-group") {
          // 重命名只在选中的分组上触发，activeGroup 必已设置。
          const group = state.groups.find((g) => g.id === state.activeGroup);
          if (group) group.name = value;
        }
        ctx.closeSheet();
        ctx.render();
      }
    });
  }

  return { bookForm, inputForm, confirmSheet, install };
}
