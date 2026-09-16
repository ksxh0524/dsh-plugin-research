/** dsh-plugin-research 浏览器半（手写 __ModuleLoader__ 工厂，无构建链），v3 宿主 PluginCard 同形折叠卡：
 *  「设置 → 插件」分区里的 research 配置卡（settings.plugin.item keyed slot，key = settings namespace 名）。
 *  宿主 ConfigurablePluginsTab 按 served namespace ∩ 本卡派发——服务端半 installSection("research") 是
 *  served namespace（见 src/cordis.ts），缺一隐身。
 *
 *  形态规范 = STANDARDS §4.1/§4.2（照宿主 dsh-client-ui-settings-plugins 发布物 PluginCard.tsx + fields.tsx
 *  + card-form.ts 的结构与状态语义，逐项对齐）：
 *  - **默认折叠成一行**：宿主插件列表是 <ul>，卡壳由卡自己出 <li>（边框/底色/圆角同宿主 .card 值）；
 *    折叠头是 <button aria-expanded>（名称压描述两行 + 未保存 Tag + chevron），body 只在展开时渲染。
 *    ——v2 把整张表单平铺常开，在一排折叠行里占一整屏，违则。
 *  - **暂存草稿**：改输入只落草稿，**保存是唯一写点**（宿主 card-form 理由：一次设置写是带 revision 的
 *    文档变更，不能由输入过程触发）；dirty → 头挂未保存 Tag + footer 出「丢弃」；非法草稿 block 保存不静默丢。
 *  - **只读文档**：getConfig 回传 writable=false 时全控件 disabled + 一行说明，不等用户敲完才报错。
 *  - **落盘后才收起**：保存成功 → 收起；失败保留草稿 + footer 左侧 role=status 报错（能修不重敲）。
 *  - **真 label**：每个控件 <label htmlFor> + id 关联，字段间 .5px border-l2 分隔线（禁裸 span 当 label）。
 *  - 复用面：Tag / chevron 图标走宿主冻结模块种子表的 `@deepseek-ai/dsh-client-ui-primitives`（§4.3）；
 *    PluginCard/ValueField/CardForm 本身在表外（属 ui-settings-plugins），故其壳照抄 CSS 值。
 *
 *  其余要点（与 usage-stats 范本同形，两边改动各自保持自洽）：
 *  - 形态 = window.__ModuleLoader__.load({id, factory})；只用基线模块表（react + ui-primitives），
 *    无 JSX（React.createElement），故无需构建。
 *  - ctx.remote 官方装配是 build 期固定能力集，不带 research 命名空间：本包自己 ctx.remote.$mount(CONTRIBUTION)
 *    挂手写 strict descriptor；服务必须用名字解析 ctx.get("remote.research")（属性式在第三方 fiber
 *    被可见性过滤 throw "without inject"——usage-stats 实锤）。
 *  - 两端契约：descriptors 与 src/cordis.ts 的 SRC 方法/参数名一一对应（getConfig/_hint、setConfig/patch），
 *    sourceLocation 锚定服务端真实定义行，挪位/改名由 contractPairSuite（dsh-check，注册在
 *    tests/standard.test.ts）当场抓住。
 *  - 配置面（src/config.ts）：默认一份 model+thinking（两角色共用），「高级：分开配」开关拆
 *    Research/Review 两个子表单（空字段 = 跟随默认）；保存落宿主 settings 的 research 段，
 *    工具 execute 时读同一份 live source——保存即对下一次调用生效，无需重启 host。
 *  - 全走 --dsw-* 设计令牌（真名实测，无自造）：控件 34px / .5px border-l4 / bg-layer-3 / focus 变 brand-primary
 *    （描边而已，填充禁止——incidents/002）；报错 state-error-primary（label-error 是假名）；
 *    footer 主按钮 = label-primary 底 + bg-layer-3 字（宿主卡同款，两主题自适应）。
 *  - settings 命名空间 = "research"（src/cordis.ts RESEARCH_SETTINGS_NAMESPACE 镜像；服务端半负责 installSection）。
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-research",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var React = require("react");
		var h = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useCallback = React.useCallback;
		var useMemo = React.useMemo;
		var useRef = React.useRef;
		/** 宿主共享控件（冻结模块种子表内词，见文件头）；缺席则退到等价 CSS 手写字（设置页不能因它整块崩）。 */
		var UI = null;
		try {
			UI = require("@deepseek-ai/dsh-client-ui-primitives") || null;
		} catch (e) {
			UI = null;
		}

		/** settings 命名空间（= section slot id = remote namespace；src/cordis.ts provide("research") 的镜像）。 */
		var SETTINGS_NS = "research";
		var CARD_TITLE = "Research 调研";
		var CARD_DESC = "research(topic) 工具的路由配置：默认一份配置，调研员与审查员共用；可拆成两角色分别配。";

		/* ---------- Remote contribution（手写 strict 描述符；与 src/cordis.ts 的 SRC 方法一一对应） ---------- */
		var passthrough = {
			parse: function (v) {
				return v === undefined ? {} : v;
			},
		};
		function codec(sym) {
			return { mode: "strict", typeSymbol: "dsh-plugin-research#" + sym, schema: passthrough };
		}
		function descriptor(method, param, location) {
			return {
				id: SETTINGS_NS + "#research/" + method,
				service: "research",
				namespace: "research",
				method: method,
				invocation: { kind: "direct" },
				// acceptsUndefined：getConfig 的 _hint 可省略（官方 codegen 对可选边界的显式字段）。
				parameters: [{ name: param, wire: param, source: "json", acceptsUndefined: true, codec: codec(method + ":" + param) }],
				result: codec(method + ":result"),
				sourceLocation: location,
			};
		}
		var CONTRIBUTION = {
			package: "dsh-plugin-research",
			descriptors: [
				descriptor("getConfig", "_hint", { file: "src/cordis.ts", line: 83, column: 9 }),
				descriptor("setConfig", "patch", { file: "src/cordis.ts", line: 97, column: 9 }),
			],
		};

		/* ---------- 样式（materialize 时注入一次）：值逐条照抄宿主 PluginCard.module.css + fields.module.css ---------- */
		var CSS = [
			// 卡壳（宿主 .card/.cardOpen/.header/.headText/.name/.description/.chevron/.body/.footer）
			".rsch-card{list-style:none;border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}",
			".rsch-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
			".rsch-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
			".rsch-head{appearance:none;width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;border:0;border-radius:12px;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}",
			".rsch-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
			".rsch-headText{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}",
			".rsch-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}",
			".rsch-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			".rsch-chev{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}",
			".rsch-chevOpen{transform:rotate(180deg)}",
			".rsch-pending{flex:none}",
			".rsch-body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}",
			".rsch-muted{color:var(--dsw-alias-label-tertiary)}",
			".rsch-readonly{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			// 字段（宿主 .field/.head/.label/.badges/.reset/.input/.hint/.invalid）
			".rsch-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}",
			".rsch-field+.rsch-field{border-top:.5px solid var(--dsw-alias-border-l2)}",
			".rsch-fhead{display:flex;align-items:center;gap:8px}",
			".rsch-label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}",
			".rsch-badges{display:inline-flex;align-items:center;gap:8px}",
			".rsch-reset{appearance:none;border:0;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer}",
			".rsch-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
			".rsch-reset:disabled{cursor:default}",
			".rsch-input,.rsch-select{box-sizing:border-box;width:100%;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}",
			".rsch-input::placeholder{color:var(--dsw-alias-label-dimmed)}",
			".rsch-input:focus-visible,.rsch-select:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}",
			".rsch-input:disabled,.rsch-select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
			".rsch-inputInvalid{border-color:var(--dsw-alias-state-error-primary)}",
			".rsch-select{cursor:pointer}",
			".rsch-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			".rsch-invalid{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}",
			// 高级拆分（开关行 + 两角色子表单）
			".rsch-adv{display:flex;align-items:center;gap:8px;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l2)}",
			".rsch-adv input{width:14px;height:14px;accent-color:var(--dsw-static-deepseek-500);cursor:pointer}",
			".rsch-adv label{cursor:pointer}",
			".rsch-split{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-bottom:12px}",
			".rsch-role{display:flex;flex-direction:column;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 10px 6px}",
			".rsch-role+.rsch-role{margin-left:0}",
			".rsch-roleTitle{padding:10px 0 0;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}",
			".rsch-role .rsch-field:first-of-type{padding-top:4px;border-top:0}",
			// footer（宿主 .footer/.discard/.save/.failed）
			".rsch-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px;border-top:.5px solid var(--dsw-alias-border-l2)}",
			".rsch-failed{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}",
			".rsch-discard,.rsch-save{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}",
			".rsch-discard{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}",
			".rsch-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
			".rsch-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
			".rsch-save:hover:not(:disabled){filter:brightness(1.12)}",
			".rsch-discard:disabled,.rsch-save:disabled{opacity:.4;cursor:default}",
			".rsch-discard:focus-visible,.rsch-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
			".rsch-note{margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			// Tag 缺席时的等价替身（宿主 Tag 组件在种子表内，正常路径不走这里）
			".rsch-tagFallback{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}",
			".rsch-chevFallback{flex:none;width:8px;height:8px;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);transform:rotate(45deg);transition:transform .16s}",
			".rsch-chevFallback.rsch-chevOpen{transform:rotate(225deg)}",
			// 动效自护：宿主 ui-theme 无全局 reduced-motion 兜底（宿主 web-styling 规则 22），加了 transition 就得自己守卫
			"@media (prefers-reduced-motion: reduce){.rsch-card,.rsch-chev,.rsch-chevFallback{transition:none}" +
				".rsch-chevOpen,.rsch-chevFallback.rsch-chevOpen{transform:none}}",
		];

		/* ---------- 远端调用与错误翻译 ---------- */
		/** mount/调用失败的原始报错翻译：without inject = 两端契约错位（浏览器半已刷新、host 仍是旧服务端），
		 *  明确告诉用户重启该 profile 的 host；其余错误原样透出。 */
		function humanizeError(msg) {
			if (/without inject|no longer mounted|is not a function/.test(msg)) {
				return (
					"读取 research 配置服务失败：浏览器半调用的是 $mount 注册到本插件 fiber 的 research 服务。" +
					"若 host 仍在运行旧版服务端（未含配置服务），需由你重启当前 profile 的 host 后刷新本页（服务端改动必须重启生效）。原始错误：" +
					msg
				);
			}
			return msg;
		}

		var THINKING_OPTIONS = [
			{ v: "", l: "跟随工作区" },
			{ v: "low", l: "低（low）" },
			{ v: "medium", l: "中（medium）" },
			{ v: "high", l: "高（high）" },
			{ v: "xhigh", l: "超高（xhigh）" },
		];

		var FIELDS = ["model", "thinking", "split", "researchModel", "researchThinking", "reviewModel", "reviewThinking"];
		var EMPTY = { model: "", thinking: "", split: false, researchModel: "", researchThinking: "", reviewModel: "", reviewThinking: "" };

		/** 模型形状（与 src/config.ts validateConfigPatch 同式）：空 = 跟随，否则必须 provider/model 二段式。 */
		function modelInvalid(v) {
			var t = String(v || "").trim();
			if (!t) return false;
			var i = t.indexOf("/");
			return i <= 0 || i === t.length - 1 || !t.slice(0, i).trim() || !t.slice(i + 1).trim();
		}

		/* ---------- 设置卡组件（宿主 PluginCard 同形） ---------- */
		function ResearchCard(props) {
			var ctx = props.ctx;
			var mounted = props.mounted;
			var _o = useState(false),
				open = _o[0],
				setOpen = _o[1];
			var _b = useState(null),
				loaded = _b[0], // 服务端已存配置（草稿基线）
				setLoaded = _b[1];
			var _d = useState(null),
				draft = _d[0], // 暂存草稿（唯一写点是保存）
				setDraft = _d[1];
			var _x = useState(""),
				loadErr = _x[0],
				setLoadErr = _x[1];
			var _f = useState(""),
				failed = _f[0],
				setFailed = _f[1];
			var _s = useState(false),
				saving = _s[0],
				setSaving = _s[1];
			var _w = useState(true),
				writable = _w[0],
				setWritable = _w[1];
			var _r = useState(""),
				workspaceRoute = _r[0],
				setWorkspaceRoute = _r[1];
			var _t = useState(""),
				settingsSection = _t[0],
				setSettingsSection = _t[1];
			var alive = useRef(0);

			var load = useCallback(
				async function () {
					var my = ++alive.current;
					setLoadErr("");
					try {
						await mounted;
						var r = await ctx.get("remote.research").getConfig(null);
						if (!r.ok) throw new Error(r.error.message);
						if (alive.current !== my) return;
						var c = Object.assign({}, EMPTY, r.value.config || {});
						setLoaded(c);
						setDraft(c);
						setWritable(r.value.writable !== false);
						setWorkspaceRoute(r.value.workspaceRoute || "");
						setSettingsSection(r.value.settingsSection || "");
					} catch (e) {
						if (alive.current === my) setLoadErr(humanizeError(String((e && e.message) || e)));
					}
				},
				[ctx, mounted],
			);
			useEffect(
				function () {
					load();
				},
				[load],
			);

			var dirty = useMemo(
				function () {
					if (!draft || !loaded) return false;
					return FIELDS.some(function (k) {
						return draft[k] !== loaded[k];
					});
				},
				[draft, loaded],
			);
			var invalid = useMemo(
				function () {
					if (!draft) return false;
					return modelInvalid(draft.model) || modelInvalid(draft.researchModel) || modelInvalid(draft.reviewModel);
				},
				[draft],
			);

			var edit = function (key) {
				return function (ev) {
					var v = key === "split" ? ev.target.checked : ev.target.value;
					setFailed("");
					setDraft(function (f) {
						var g = Object.assign({}, f);
						g[key] = v;
						return g;
					});
				};
			};
			/** 重置 = 暂存一次清空（该字段回落跟随链；保存后才写回宿主）。 */
			var reset = function (key) {
				return function () {
					setFailed("");
					setDraft(function (f) {
						var g = Object.assign({}, f);
						g[key] = "";
						return g;
					});
				};
			};
			var discard = function () {
				setFailed("");
				setDraft(loaded);
			};
			/** 唯一写点：整份草稿一次 setConfig；成功以宿主回读为基线并收起，失败留草稿。 */
			var save = useCallback(
				async function () {
					if (!dirty || invalid || saving) return;
					setSaving(true);
					setFailed("");
					try {
						await mounted;
						var r = await ctx.get("remote.research").setConfig({
							model: String(draft.model).trim(),
							thinking: draft.thinking,
							split: draft.split,
							researchModel: String(draft.researchModel).trim(),
							researchThinking: draft.researchThinking,
							reviewModel: String(draft.reviewModel).trim(),
							reviewThinking: draft.reviewThinking,
						});
						if (!r.ok) throw new Error(r.error.message);
						var next = Object.assign({}, EMPTY, r.value || {});
						setLoaded(next);
						setDraft(next);
						setOpen(false); // 宿主同款：确认落盘才收起
					} catch (e) {
						setFailed(String((e && e.message) || e));
					} finally {
						setSaving(false);
					}
				},
				[ctx, mounted, draft, dirty, invalid, saving],
			);

			/** Tag / chevron 优先复用宿主共享控件（§4.3 种子表），缺席退 CSS 替身。 */
			function tag(text) {
				if (UI && UI.Tag) return h(UI.Tag, { tone: "neutral", className: "rsch-pending" }, text);
				return h("span", { className: "rsch-tagFallback" }, text);
			}
			function chevron() {
				var cls = "rsch-chev" + (open ? " rsch-chevOpen" : "");
				if (UI && UI.IconChevronDownOutline14) return h(UI.IconChevronDownOutline14, { className: cls });
				return h("span", { className: "rsch-chevFallback" + (open ? " rsch-chevOpen" : "") });
			}
			/** 字段壳：真 label 关联 + 覆盖标记与重置 + 控件 + hint/invalid 同位替换。 */
			function field(key, label, ph, hint, control) {
				var id = "rsch-f-" + key;
				var bad = key.match(/model$/i) && modelInvalid(draft[key]);
				var overridden = draft[key] !== "" && draft[key] !== (key === "split" ? false : "");
				return h(
					"div",
					{ className: "rsch-field" },
					h(
						"div",
						{ className: "rsch-fhead" },
						h("label", { className: "rsch-label", htmlFor: id }, label),
						overridden
							? h(
									"span",
									{ className: "rsch-badges" },
									tag("已覆盖"),
									h("button", { type: "button", className: "rsch-reset", disabled: !writable, onClick: reset(key) }, "重置"),
								)
							: null,
					),
					control(id, bad),
					h("p", { className: bad ? "rsch-invalid" : "rsch-hint" }, bad ? "模型须写成 provider/model 两段（留空 = 跟随）。" : hint),
				);
			}
			var modelControl = function (key, ph) {
				return function (id, bad) {
					return h("input", {
						id: id,
						className: bad ? "rsch-input rsch-inputInvalid" : "rsch-input",
						value: draft[key],
						placeholder: ph,
						spellCheck: false,
						disabled: !writable,
						...(bad ? { "aria-invalid": true } : {}),
						onChange: edit(key),
					});
				};
			};
			var thinkingControl = function (key) {
				return function (id) {
					return h(
						"select",
						{ id: id, className: "rsch-select", value: draft[key], disabled: !writable, onChange: edit(key) },
						THINKING_OPTIONS.map(function (o) {
							return h("option", { key: o.v, value: o.v }, o.l);
						}),
					);
				};
			};

			var modelHint = workspaceRoute
				? "留空 = 跟随工作区路由（当前生效：" + workspaceRoute + "）"
				: "留空 = 跟随工作区路由键（工作区路由暂缺位，须先在路由表或 profile 配 primary）";
			var modelPlaceholder = workspaceRoute ? workspaceRoute.split("/").slice(0, 2).join("/") : "provider/model";

			var header = h(
				"button",
				{
					type: "button",
					className: "rsch-head",
					"aria-expanded": open,
					"aria-label": (open ? "收起: " : "展开: ") + CARD_TITLE,
					onClick: function () {
						setOpen(!open);
					},
				},
				h(
					"span",
					{ className: "rsch-headText" },
					h("span", { className: "rsch-name" }, CARD_TITLE),
					h("span", { className: "rsch-desc" }, loaded || loadErr ? CARD_DESC : "读取配置…"),
				),
				dirty ? tag("未保存") : null,
				chevron(),
			);

			if (!draft) {
				return h(
					"li",
					{ className: "rsch-card" },
					header,
					loadErr ? h("div", { className: "rsch-body" }, h("p", { className: "rsch-failed", role: "status" }, loadErr)) : null,
				);
			}

			return h(
				"li",
				{ className: open ? "rsch-card rsch-cardOpen" : "rsch-card" },
				header,
				open
					? h(
							"div",
							{ className: "rsch-body" },
							writable ? null : h("p", { className: "rsch-readonly" }, "宿主设置文档当前为只读，控件不可写；解锁文档后再来改。"),
							field("model", "默认模型（Research + Review 共用）", modelPlaceholder, modelHint, modelControl("model", modelPlaceholder)),
							field("thinking", "默认思考强度", "", "留空 = 跟随工作区路由声明的档位。", thinkingControl("thinking")),
							h(
								"div",
								{ className: "rsch-adv" },
								h("input", { type: "checkbox", id: "rsch-f-split", checked: !!draft.split, disabled: !writable, onChange: edit("split") }),
								h("label", { htmlFor: "rsch-f-split" }, "高级：Research / Review 分开配"),
							),
							draft.split
								? h(
										"div",
										{ className: "rsch-split" },
										h(
											"div",
											{ className: "rsch-role" },
											h("div", { className: "rsch-roleTitle" }, "调研员（初稿 + 修订轮）"),
											field("researchModel", "模型", "跟随默认", "留空 = 跟随默认配置。", modelControl("researchModel", "跟随默认")),
											field("researchThinking", "思考强度", "", "留空 = 跟随默认配置。", thinkingControl("researchThinking")),
										),
										h(
											"div",
											{ className: "rsch-role" },
											h("div", { className: "rsch-roleTitle" }, "审查员（独立审稿）"),
											field("reviewModel", "模型", "跟随默认", "留空 = 跟随默认配置。", modelControl("reviewModel", "跟随默认")),
											field("reviewThinking", "思考强度", "", "留空 = 跟随默认配置。", thinkingControl("reviewThinking")),
										),
									)
								: null,
							h(
								"div",
								{ className: "rsch-foot" },
								failed ? h("p", { className: "rsch-failed", role: "status" }, "保存未落盘：" + failed) : null,
								h("button", { type: "button", className: "rsch-discard", disabled: !dirty || saving, onClick: discard }, "丢弃"),
								h(
									"button",
									{ type: "button", className: "rsch-save", disabled: !dirty || invalid || saving || !writable, onClick: save },
									saving ? "保存中…" : "保存",
								),
							),
							h(
								"p",
								{ className: "rsch-note" },
								(settingsSection ? "配置写进宿主 settings 的「" + settingsSection + "」段；" : "") +
									"保存后对下一次 research 调用即生效（进行中的调研不受影响，无需重启 host）。",
							),
						)
					: null,
			);
		}

		/* ---------- cordis 客户端插件入口 ---------- */
		var inject = ["slots", "remote"];

		function ensureCss() {
			if (document.getElementById("rsch-css")) return;
			var el = document.createElement("style");
			el.id = "rsch-css";
			el.textContent = CSS.join("\n");
			document.head.appendChild(el);
		}

		function apply(ctx) {
			ensureCss();
			var mounted = ctx.remote.$mount(CONTRIBUTION);
			mounted.then(null, function () {}); // 无人等待时兜底，防未处理 rejection；页内 await 仍会把错误抛给 try/catch
			// 「设置 → 插件」分区的插件配置卡（keyed slot，key 必须 === settings namespace 名——
			// 宿主 ConfigurablePluginsTab 按 served namespace ∩ 本卡求交派发，缺一隐身）。
			ctx.effect(function () {
				return ctx.slots.inject("settings.plugin.item", function () {
					return ctx.slots.register({ name: "settings.plugin.item", key: SETTINGS_NS }, function () {
						return h(ResearchCard, { ctx: ctx, mounted: mounted });
					});
				});
			}, "dsh-plugin-research: plugin card");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
