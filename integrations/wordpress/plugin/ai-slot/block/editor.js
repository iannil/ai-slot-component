// ai-slot Gutenberg 区块（编辑器侧，免构建：直接使用 wp.* 全局）。
// 前台渲染由 ai-slot.php 的 render_callback 完成，与简码共用同一出口。
(function (blocks, element, blockEditor, components) {
  var el = element.createElement;
  var useBlockProps = blockEditor.useBlockProps;

  blocks.registerBlockType('ai-slot/slot', {
    edit: function (props) {
      var attrs = props.attributes;
      var set = props.setAttributes;
      return el('div', useBlockProps(),
        el(blockEditor.InspectorControls, null,
          el(components.PanelBody, { title: '槽位设置', initialOpen: true },
            el(components.TextControl, {
              label: '槽位标识',
              value: attrs.name,
              onChange: function (v) { set({ name: v }); },
            }),
            el(components.TextControl, {
              label: '交付端点（HTTPS，留空用插件默认值）',
              value: attrs.src,
              placeholder: 'https://delivery.example/ai-render/hero',
              onChange: function (v) { set({ src: v }); },
            }),
            el(components.TextControl, {
              label: '轮询间隔（秒，-1 继承默认，0 不轮询）',
              type: 'number',
              value: String(attrs.refreshInterval),
              onChange: function (v) { set({ refreshInterval: parseInt(v, 10) || 0 }); },
            }),
            el(components.ToggleControl, {
              label: 'fresh-only（失败时回退原始内容）',
              checked: attrs.freshOnly,
              onChange: function (v) { set({ freshOnly: v }); },
            })
          )
        ),
        el(components.TextareaControl, {
          label: '原始兜底内容（AI 不可用时显示）',
          value: attrs.fallback,
          rows: 3,
          onChange: function (v) { set({ fallback: v }); },
        }),
        el('p', { style: { color: '#86909c', fontSize: '12px', margin: '8px 0 0' } },
          'ai-slot 槽位「' + (attrs.name || 'hero') + '」：前台加载 AI 内容，失败时显示上方兜底。'
        )
      );
    },
    save: function () { return null; }, // 动态区块
  });
})(window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components);
