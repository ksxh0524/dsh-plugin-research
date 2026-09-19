/** dsh-plugin-research 浏览器半（手写 __ModuleLoader__ 工厂，无构建链），DSH 实例插件管理页配置卡：
 *  侧边栏「插件」面板 → research 卡（summary 一句话 + page 完整表单）。
 *  DSH 实例 PluginConfigForm 同形直出表单（索引仓 `docs/settings-cards.md` §1.1/§1.2：详情打开即见表单，
 *  不套折叠框、不点第二次；文本框改输入只落草稿、保存是其唯一写点；封闭值域（下拉/勾选）onChange 单字段直写；
 *  无丢弃按钮——草稿只活在组件 state，离页卸载即弃；只读文档禁用控件并说明；
 *  保存成功只刷新基线不清屏，失败保留草稿 + footer 左侧 role=status 报错；真 label 关联）。
 *
 *  席位契约（DSH 实例 0.1.6，语义锚 = dsh-client-ui-plugin-manager bundle 的 plugins.item 槽 + 官方
 *  BashCard/AgentLoopCard 的 view 双态 + settings-plugins bundle 的 PluginConfigForm）：
 *  - 注册进 `plugins.item`（list 槽，`id`/`order`/`label`；`id` 必须 === settings 命名空间名，
 *    即服务端半 installSection("research") 的 served namespace——两端靠它配对，缺一隐身；
 *    上一代 keyed 槽已下线，此处不许出现它的字面量）。
 *  - 组件收 `{view}`：`summary` 回一句话简介（卡片行 + 详情页头共用），`page` 回完整表单。
 *    列表卡壳（宿主 `<li class=card>`）与详情壳（面包屑 + `<h3>` 标题 + summary + `detailSections`）
 *    都归宿主 ItemCard/ItemDetail，卡自己不出 `<li>`、不出折叠头、不出 chevron。
 *    自研卡 order 排官方四卡之后（官方 bash 10 / agent-loop 20 / subagent 30 / web-search 40）。
 *
 *  形态规范 = 索引仓 `docs/settings-cards.md` §1.1/§1.2（照 DSH 实例 dsh-client-ui-settings-plugins 发布物 PluginConfigForm +
 *  fields.tsx + card-form.ts 的结构与状态语义，逐项对齐）：
 *  - **默认不要折叠框**：`page` 直接渲染表单根 `<div>`（官方 BashCard 回 PluginConfigForm 的
 *    `<div class=form>` 同形）；详情里再套折叠卡就是双重标题 + 点两次才见控件，一律不合规。
 *    表单内高级分组之类的小节折叠除外，但整份表单不许折成一行。
 *  - **文本框暂存草稿**：改输入只落草稿，**保存是文本草稿唯一写点**（DSH 实例 card-form 理由：一次设置写是带 revision 的
 *    文档变更，不能由输入过程触发）；dirty → footer 挂未保存 Tag；非法草稿 block 保存不静默丢。
 *    无丢弃按钮：草稿只活在组件 state，详情离页卸载即弃，不设显式丢弃入口（索引仓 `docs/settings-cards.md` §1.2 例外节）。
 *  - **封闭值域控件直写**：下拉/勾选的每个选项都是完整合法值（无非法中间态、无需预览），onChange 直接单字段
 *    setConfig 即时写，不进草稿、不依赖保存按钮；全卡写收敛于 writePatch 一处（直写点唯一）；成功刷新基线，
 *    失败控件读基线自动回滚 + footer 左侧 role=status 报错并给重试（card-form 暂存理由在此不适用；
 *    索引仓 `docs/settings-cards.md` §1.2 例外节）。
 *  - **下拉样式**：照抄 DSH 实例 ui-settings-models ModelsSection 的 selectInput（appearance:none + 12px chevron
 *    data-URI + 右 32px 槽位 + max-width 240px；fields.tsx 只有文本框、无下拉可抄）。
 *  - **只读文档**：getConfig 回传 writable=false 时全控件 disabled + 一行说明，不等用户敲完才报错。
 *  - **保存成功只刷新基线不清屏**（详情页常驻，无收起时序）；失败保留草稿 + footer 左侧 role=status 报错（能修不重敲）。
 *  - **真 label**：每个控件 <label htmlFor> + id 关联，字段间 .5px border-l2 分隔线（禁裸 span 当 label）。
 *  - 复用面：Tag 走 DSH 实例冻结模块种子表的 `@deepseek-ai/dsh-client-ui-primitives`（索引仓 `docs/design-tokens.md` §4.3）；
 *    PluginConfigForm/ValueField 本身在表外（属 ui-settings-plugins），故其壳照抄 CSS 值。
 *
 *  其余要点（行为与旧卡一致）：
 *  - 形态 = window.__ModuleLoader__.load({id, factory})；只用基线模块表（react + ui-primitives），
 *    无 JSX（React.createElement），故无需构建。
 *  - ctx.remote 官方装配是 build 期固定能力集，不带 research 命名空间：本包自己 ctx.remote.$mount(CONTRIBUTION)
 *    挂手写 strict descriptor；服务必须用名字解析 ctx.get("remote.research")（属性式在自研 fiber
 *    被可见性过滤 throw "without inject"——实锤）。
 *  - 两端契约：descriptors 与 src/cordis.ts 的 SRC 方法/参数名一一对应（getConfig/_hint、setConfig/patch），
 *    sourceLocation 锚定服务端真实定义行，挪位/改名由 contractPairSuite（dsh-check，注册在
 *    tests/standard.test.ts）当场抓住。
 *  - 配置面（src/config.ts）：默认一份 model+thinking（两角色共用），「高级：分开配」开关拆
 *    Research/Review 两个子表单（空字段 = 跟随默认）；保存落 DSH 实例 settings 的 research 段，
 *    工具 execute 时读同一份 live source——保存即对下一次调用生效，无需重启 host。
 *  - 全走 --dsw-* 设计令牌（真名实测，无自造）：控件 34px / .5px border-l4 / bg-layer-3 / focus 变 brand-primary
 *    （描边而已，填充禁止——incidents/002）；报错 state-error-primary（label-error 是假名）；
 *    footer 主按钮 = label-primary 底 + bg-layer-3 字（DSH 实例卡同款，两主题自适应）。
 *  - settings 命名空间 = "research"（src/cordis.ts RESEARCH_SETTINGS_NAMESPACE 镜像；服务端半负责 installSection；
 *    本卡的 plugins.item `id` 必须与之一致，配对门见 tests/standard.test.ts）。
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
		/** DSH 实例共享控件（冻结模块种子表内词，见文件头）；缺席则退到等价 CSS 手写字（设置页不能因它整块崩）。 */
		var UI = null;
		try {
			UI = require("@deepseek-ai/dsh-client-ui-primitives") || null;
		} catch (e) {
			UI = null;
		}

		/** settings 命名空间（= plugins.item entry id = remote namespace；
		 *  src/cordis.ts provide("research") 与 installSection("research") 的镜像，三处同名才配对成功）。 */
		var SETTINGS_NS = "research";
		var CARD_TITLE = "Research 调研";
		var CARD_DESC = "research(topic) 路由配置：默认一份，可按角色拆分。";
		/** plugins.item 排序（官方四卡 bash 10 / agent-loop 20 / subagent 30 / web-search 40，自研卡排之后）。 */
		var CARD_ORDER = 100;

		/* ---------- Remote contribution（手写 strict 描述符；与 src/cordis.ts 的 SRC 方法一一对应） ---------- */
		var passthrough = {
			parse: function (v) {
				return v === undefined ? {} : v;
			},
		};
		function codec(sym) {
			// 网关 ≥0.1.6 用 create() 物化 schema 再 parse（dsh-api-gateway decode），老网关走 schema.parse——两边都给，双向兼容。
			return {
				mode: "strict",
				typeSymbol: "dsh-plugin-research#" + sym,
				schema: passthrough,
				create: function () {
					return passthrough;
				},
			};
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
				descriptor("getConfig", "_hint", { file: "src/cordis.ts", line: 85, column: 9 }),
				descriptor("setConfig", "patch", { file: "src/cordis.ts", line: 92, column: 9 }),
				descriptor("listModels", "_hint", { file: "src/cordis.ts", line: 104, column: 9 }),
			],
		};

		/* ---------- 样式（materialize 时注入一次）：值逐条照抄 DSH 实例 PluginConfigForm.module.css + fields.module.css ---------- */
		var CSS = [
			// 表单根（DSH 实例 .form：纵排 flex，无卡壳、无折叠头——壳归宿主 ItemDetail）
			".rsch-form{display:flex;flex-direction:column}",
			".rsch-muted{color:var(--dsw-alias-label-tertiary)}",
			".rsch-readonly{margin:0 0 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			// 字段（DSH 实例 .field/.head/.label/.badges/.reset/.input/.hint/.invalid）
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
			// 下拉（DSH 实例 ui-settings-models ModelsSection selectInput 同形：OS 原生箭头贴右边缘太丑，
			// appearance:none + 12px chevron data-URI 右 12px 居中 + 右 32px 槽位；短选项不撑满字段宽，max-width 240px）
			".rsch-select{cursor:pointer;appearance:none;max-width:240px;padding-right:32px;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 12px center;background-size:12px 12px}",
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
			// footer（DSH 实例 .footer：保存右对齐 + 失败行；未保存 Tag 挂保存左侧；无丢弃按钮，离页即弃）
			".rsch-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:16px}",
			".rsch-failed{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}",
			".rsch-save{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}",
			".rsch-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
			".rsch-save:hover:not(:disabled){filter:brightness(1.12)}",
			".rsch-save:disabled{opacity:.4;cursor:default}",
			".rsch-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
			// Tag 缺席时的等价替身（DSH 实例 Tag 组件在种子表内，正常路径不走这里）
			".rsch-tagFallback{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}",
			".rsch-pending{flex:none}",
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

		/** 文本框字段（走草稿 + 保存）；下拉/勾选字段（thinking/split/researchThinking/reviewThinking）走单字段直写，不进草稿。 */
		var TEXT_FIELDS = ["model", "researchModel", "reviewModel"];
		var EMPTY = { model: "", thinking: "", split: false, researchModel: "", researchThinking: "", reviewModel: "", reviewThinking: "" };

		/** 模型形状（与 src/config.ts validateConfigPatch 同式）：空 = 跟随，否则必须 provider/model 二段式。 */
		function modelInvalid(v) {
			var t = String(v || "").trim();
			if (!t) return false;
			var i = t.indexOf("/");
			return i <= 0 || i === t.length - 1 || !t.slice(0, i).trim() || !t.slice(i + 1).trim();
		}

		/* ---------- 设置表单（DSH 实例 PluginConfigForm 同形：page 直出，无折叠） ---------- */
		function ResearchCard(props) {
			var ctx = props.ctx;
			var mounted = props.mounted;
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
			var _g = useState(null),
				writing = _g[0], // 正在直写的封闭值域字段（写途中同类控件禁用，防并发两写）
				setWriting = _g[1];
			var _w = useState(true),
				writable = _w[0],
				setWritable = _w[1];
			var _r = useState(null),
				modelOptions = _r[0],
				setModelOptions = _r[1];
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
						try {
							var m = await ctx.get("remote.research").listModels(null);
							if (alive.current !== my) return;
							setModelOptions(m && m.ok && Array.isArray(m.value.models) ? m.value.models : []);
						} catch (e2) {
							if (alive.current === my) setModelOptions([]);
						}
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
					return TEXT_FIELDS.some(function (k) {
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
					var v = ev.target.value;
					setFailed("");
					setDraft(function (f) {
						var g = Object.assign({}, f);
						g[key] = v;
						return g;
					});
				};
			};
			/** 重置 = 暂存一次清空（该字段回落跟随链；保存后才写回 DSH 实例）。 */
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
			var _t = useState(null),
				retry = _t[0], // 写失败待重试：{key, value} 直写单字段 | {save:true} 文本保存；新改动会冲掉它
				setRetry = _t[1];
			/** 全卡唯一写点：直写与保存都经此一处 setConfig（门：直写点唯一）；成功回服务端全量，失败抛错由调用方留痕 + 挂重试。 */
			async function writePatch(patch) {
				await mounted;
				var r = await ctx.get("remote.research").setConfig(patch);
				if (!r.ok) throw new Error(r.error.message);
				return Object.assign({}, EMPTY, r.value || {});
			}
			/** 封闭值域直写：下拉/勾选 onChange 单字段即时写，不进草稿（选项皆为完整合法值，无需预览校验）。
			 *  成功以服务端回读刷新基线并同步该键（文本草稿原样保留），失败基线不动——控件读基线渲染，自动回滚旧值 + footer 重试。 */
			var directWrite = useCallback(
				async function (key, value) {
					if (writing !== null || !writable) return;
					setWriting(key);
					setFailed("");
					setRetry(null);
					try {
						var patch = {};
						patch[key] = value;
						var next = await writePatch(patch);
						setLoaded(next);
						setDraft(function (f) {
							var g = Object.assign({}, f);
							g[key] = next[key];
							return g;
						});
					} catch (e) {
						setFailed(String((e && e.message) || e));
						setRetry({ key: key, value: value });
					} finally {
						setWriting(null);
					}
				},
				[ctx, mounted, writable, writing],
			);
			/** 封闭值域重置 = 就地写清（下拉回跟随、勾选回关闭），不进草稿。 */
			var resetDirect = function (key) {
				return function () {
					directWrite(key, key === "split" ? false : "");
				};
			};
			/** 文本框写：只写三文本字段（封闭值域已就地写过，不重写）；成功以服务端回读为基线，失败留草稿 + footer 重试。 */
			var save = useCallback(
				async function () {
					if (!dirty || invalid || saving) return;
					setSaving(true);
					setFailed("");
					setRetry(null);
					try {
						var next = await writePatch({
							model: String(draft.model).trim(),
							researchModel: String(draft.researchModel).trim(),
							reviewModel: String(draft.reviewModel).trim(),
						});
						setLoaded(next);
						setDraft(next);
					} catch (e) {
						setFailed(String((e && e.message) || e));
						setRetry({ save: true });
					} finally {
						setSaving(false);
					}
				},
				[ctx, mounted, draft, dirty, invalid, saving],
			);
			/** 失败重试入口：直写失败重放该单字段，文本保存失败重走保存；新改动已冲掉待重试时不做事。 */
			var doRetry = function () {
				if (!retry || saving || writing !== null) return;
				if (retry.save) save();
				else directWrite(retry.key, retry.value);
			};

			/** Tag 优先复用 DSH 实例共享控件（索引仓 `docs/design-tokens.md` §4.3 种子表），缺席退 CSS 替身。 */
			function tag(text) {
				if (UI && UI.Tag) return h(UI.Tag, { tone: "neutral", className: "rsch-pending" }, text);
				return h("span", { className: "rsch-tagFallback" }, text);
			}
			/** 字段壳：真 label 关联 + 覆盖标记与重置 + 控件 + hint/invalid 同位替换。
			 *  direct=false 文本框：读草稿、重置暂存一次 clear；direct=true 封闭值域：读基线（直写失败自动回滚）、重置就地写清。 */
			function field(key, label, ph, hint, control, direct) {
				var id = "rsch-f-" + key;
				var shown = direct ? loaded[key] : draft[key];
				var bad = !direct && key.match(/model$/i) && modelInvalid(draft[key]);
				var overridden = shown !== "" && shown !== false;
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
									h(
										"button",
										{ type: "button", className: "rsch-reset", disabled: !writable || writing !== null, onClick: direct ? resetDirect(key) : reset(key) },
										"重置",
									),
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
						list: "rsch-model-list",
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
						{
							id: id,
							className: "rsch-select",
							value: loaded[key],
							disabled: !writable || writing !== null,
							onChange: function (ev) {
								directWrite(key, ev.target.value);
							},
						},
						THINKING_OPTIONS.map(function (o) {
							return h("option", { key: o.v, value: o.v }, o.l);
						}),
					);
				};
			};

			var modelHint = "留空 = 跟随主会话。";
			var modelPlaceholder = "留空跟随主会话，下拉或手填";

			// 直出表单（壳归宿主 ItemDetail：面包屑 + 标题 + summary 都在外面，这里只出字段 + footer）。
			if (!draft) {
				return h(
					"div",
					{ className: "rsch-form" },
					loadErr ? h("p", { className: "rsch-failed", role: "status" }, loadErr) : h("p", { className: "rsch-muted", role: "status" }, "读取配置…"),
				);
			}

			return h(
				"div",
				{ className: "rsch-form" },
				writable ? null : h("p", { className: "rsch-readonly" }, "DSH 实例设置文档当前为只读，控件不可写；解锁文档后再来改。"),
				// 三模型框共用一个 datalist（配好的模型下拉直选；手填照旧，校验不动）。
				modelOptions && modelOptions.length
					? h(
							"datalist",
							{ id: "rsch-model-list" },
							modelOptions.map(function (o) {
								return h("option", { key: o.value, value: o.value }, o.label || o.value);
							}),
						)
					: null,
				field("model", "默认模型（Research + Review 共用）", modelPlaceholder, modelHint, modelControl("model", modelPlaceholder)),
				field("thinking", "默认思考强度", "", "留空 = DSH 实例默认档。选了即存，不用按保存。", thinkingControl("thinking"), true),
				h(
					"div",
					{ className: "rsch-adv" },
					h("input", {
						type: "checkbox",
						id: "rsch-f-split",
						checked: !!loaded.split,
						disabled: !writable || writing !== null,
						onChange: function (ev) {
							directWrite("split", ev.target.checked);
						},
					}),
					h("label", { htmlFor: "rsch-f-split" }, "高级：Research / Review 分开配"),
				),
				loaded.split
					? h(
							"div",
							{ className: "rsch-split" },
							h(
								"div",
								{ className: "rsch-role" },
								h("div", { className: "rsch-roleTitle" }, "调研员（初稿 + 修订轮）"),
								field("researchModel", "模型", "跟随默认", "留空 = 跟随默认配置。", modelControl("researchModel", "跟随默认")),
								field("researchThinking", "思考强度", "", "留空 = 跟随默认配置。选了即存，不用按保存。", thinkingControl("researchThinking"), true),
							),
							h(
								"div",
								{ className: "rsch-role" },
								h("div", { className: "rsch-roleTitle" }, "审查员（独立审稿）"),
								field("reviewModel", "模型", "跟随默认", "留空 = 跟随默认配置。", modelControl("reviewModel", "跟随默认")),
								field("reviewThinking", "思考强度", "", "留空 = 跟随默认配置。选了即存，不用按保存。", thinkingControl("reviewThinking"), true),
							),
						)
					: null,
				h(
					"div",
					{ className: "rsch-foot" },
					failed ? h("p", { className: "rsch-failed", role: "status" }, "保存未落盘：" + failed) : null,
					dirty ? tag("未保存") : null,
					retry ? h("button", { type: "button", className: "rsch-save", disabled: saving || writing !== null, onClick: doRetry }, "重试") : null,
					h(
						"button",
						{ type: "button", className: "rsch-save", disabled: !dirty || invalid || saving || !writable, onClick: save },
						saving ? "保存中…" : "保存",
					),
				),
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

		/* ---------- plugins.item 入口（view 双态：summary 一句话 / page 完整表单） ---------- */
		function ResearchEntry(props) {
			// summary 视图不挂任何 hook（纯静态简介，卡片行 + 详情页头共用）。
			if (props && props.view === "summary") return CARD_DESC;
			return h(ResearchCard, { ctx: props.ctx, mounted: props.mounted });
		}

		function apply(ctx) {
			ensureCss();
			var mounted = ctx.remote.$mount(CONTRIBUTION);
			mounted.then(null, function () {}); // 无人等待时兜底，防未处理 rejection；页内 await 仍会把错误抛给 try/catch
			// 插件管理页的 research 配置卡（plugins.item list 槽：id 必须 === settings namespace 名，
			// 即服务端半 installSection("research") 的 served namespace——两端靠它配对，缺一隐身）。
			ctx.effect(function () {
				return ctx.slots.inject("plugins.item", function () {
					return ctx.slots.register({ name: "plugins.item", id: SETTINGS_NS, order: CARD_ORDER, label: CARD_TITLE }, function (slotProps) {
						return h(ResearchEntry, { ctx: ctx, mounted: mounted, view: slotProps && slotProps.view });
					});
				});
			}, "dsh-plugin-research: plugin card");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
