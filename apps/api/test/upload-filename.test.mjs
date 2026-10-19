import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUploadFilename } from '../src/upload-filename.ts';

test('浏览器单独提交 UTF-8 原始文件名', () => {
  const encoded = Buffer.from('项目文档（第二版）.pdf', 'utf8').toString('latin1');
  assert.equal(normalizeUploadFilename(encoded, '项目文档（第二版）.pdf'), '项目文档（第二版）.pdf');
});

test('兼容旧上传客户端：自动修复 Latin-1 误解码的中文名', () => {
  const original = 'NestJS 学习笔记.docx';
  const mojibake = Buffer.from(original, 'utf8').toString('latin1');
  assert.equal(normalizeUploadFilename(mojibake), original);
});

test('正常中文文件名不应二次转码', () => {
  assert.equal(normalizeUploadFilename('学习计划.md'), '学习计划.md');
});

test('真实 Latin-1 文件名及特殊符号不应出现乱码', () => {
  assert.equal(normalizeUploadFilename('café.pdf'), 'café.pdf');
  assert.equal(normalizeUploadFilename('文件夹/学习记录.md'), '文件夹_学习记录.md');
});
