/** dsh-plugin-research 浏览器半（手写 __ModuleLoader__ 工厂，无构建链），v2 插件卡形态：
 *  「设置 → 插件」分区里的 research 配置卡（settings.plugin.item keyed slot，key = settings namespace 名）。
 *  宿主 ConfigurablePluginsTab 按 served namespace ∩ 本卡派发——服务端半 installSection("research") 是
 *  served namespace（见 src/cordis.ts），缺一隐身。
 *
 *  要点（与 usage-stats 范本同形，两边改动各自保持自洽）：
 *  - 形态 = window.__ModuleLoader__.load({id, factory})；只用基线模块表（react），无 JSX（React.createElement）。
 *  - ctx.remote 官方装配是 build 期固定能力集，不带 research 命名空间：本包自己 ctx.remote.$mount(CONTRIBUTION)
 *    挂手写 strict descriptor；服务必须用名字解析 ctx.get("remote.research")（属性式在第三方 fiber
 *    被可见性过滤 throw "without inject"——usage-stats 实锤）。
 *  - 两端契约：descriptors 与 src/cordis.ts 的 SRC 方法/参数名一一对应（getConfig/_hint、setConfig/patch），
 *    sourceLocation 锚定服务端真实定义行，挪位/改名由 tests/contract-pair.test.ts 当场抓住。
 *  - 配置面（src/config.ts）：默认一份 model+thinking（两角色共用），「高级：分开配」开关拆
 *    Research/Review 两个子表单（空字段 = 跟随默认）；保存落 <ws>/.runtime/research/config.json，
 *    工具 execute 时读同一份（settings 段 live source）——保存即对下一次调用生效，无需重启 host。
 *  - 全走 --dsw-* 设计令牌（与 usage-stats 同套：34px 控件、.5px 细边、bg-layer-3 底、focus 变 brand-primary、
 *    报错 state-error-primary；主按钮 = static-deepseek-500 蓝填充 + bluish-00 白字）。
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
		var useRef = React.useRef;

		/** settings 命名空间（= section slot id = remote namespace；src/cordis.ts provide("research") 的镜像）。 */
		var SETTINGS_NS = "research";

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
				descriptor("getConfig", "_hint", { file: "src/cordis.ts", line: 81, column: 9 }),
				descriptor("setConfig", "patch", { file: "src/cordis.ts", line: 94, column: 9 }),
			],
		};

		/* ---------- 样式（materialize 时注入一次） ----------
		 * 1:1 对齐宿主官方设置页表单规范（usage-stats 已真机验证的同套 token）：34px 控件、圆角 8、
		 * .5px 细边 border-l4、底 bg-layer-3、focus 变 brand-primary；报错 = 12px state-error-primary。
		 * 主按钮 = static-deepseek-500 蓝填充 + static-neutral-bluish-00 白字（alias-brand-primary 是墨色
		 * token，浅色主题拿它做填充配对 = 黑底黑字，真机踩实过的坑，不用）。 */
		var CSS = [
			".rsch-root{display:flex;flex-direction:column;gap:14px;padding:16px 18px;overflow:auto;height:100%;box-sizing:border-box;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);max-width:720px}",
			".rsch-head{display:flex;flex-direction:column;gap:2px}",
			".rsch-head b{font-size:16px;font-weight:600}",
			".rsch-muted{color:var(--dsw-alias-label-tertiary)}",
			".rsch-sec{display:flex;flex-direction:column;gap:8px}",
			".rsch-sec-title{font-size:13px;font-weight:500}",
			".rsch-sec-body{display:flex;flex-direction:column;gap:10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px;background:var(--dsw-alias-bg-layer-1)}",
			".rsch-row{display:flex;flex-direction:column;gap:4px}",
			".rsch-lbl{font-size:12px;color:var(--dsw-alias-label-secondary)}",
			".rsch-hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".rsch-input,.rsch-select{all:unset;box-sizing:border-box;width:100%;height:34px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);font-variant-numeric:tabular-nums}",
			".rsch-input::placeholder{color:var(--dsw-alias-label-dimmed)}",
			".rsch-input:hover,.rsch-select:hover{border-color:var(--dsw-alias-border-l3)}",
			".rsch-input:focus-visible,.rsch-select:focus-visible{border-color:var(--dsw-alias-brand-primary)}",
			".rsch-select{cursor:pointer}",
			".rsch-adv{display:flex;align-items:center;gap:8px}",
			".rsch-adv input{width:14px;height:14px;accent-color:var(--dsw-static-deepseek-500);cursor:pointer}",
			".rsch-adv label{cursor:pointer}",
			".rsch-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
			".rsch-role{display:flex;flex-direction:column;gap:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px}",
			".rsch-role b{font-size:12px;font-weight:500}",
			".rsch-ft{display:flex;align-items:center;gap:10px}",
			".rsch-save{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;height:34px;padding:0 16px;border-radius:8px;font-size:13px;line-height:1.5;font-weight:500;background:var(--dsw-static-deepseek-500);color:var(--dsw-static-neutral-bluish-00)}",
			".rsch-save:hover{filter:brightness(1.08)}",
			".rsch-save:focus-visible{outline:1.5px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
			".rsch-save[aria-disabled=true]{opacity:.55;cursor:default}",
			".rsch-err{color:var(--dsw-alias-state-error-primary);font-size:12px}",
			".rsch-ok{color:var(--dsw-alias-label-secondary);font-size:12px}",
		];

		/* ---------- 远端调用与错误翻译 ---------- */
		/** mount/调用失败的原始报错翻译：without inject = 两端契约错位（浏览器半已刷新、host 仍是旧服务端），
		 *  明确告诉用户重启该 profile 的 host；其余错误原样透出。 */
		function humanizeError(msg) {
			if (/without inject|no longer mounted|is not a function|undefined/.test(msg)) {
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

		/* ---------- 设置页组件 ---------- */
		function ResearchSection(props) {
			var ctx = props.ctx;
			var mounted = props.mounted;
			var _f = useState(null),
				form = _f[0],
				setForm = _f[1];
			var _m = useState(""),
				workspaceRoute = _m[0],
				setWorkspaceRoute = _m[1];

			var _e = useState(null),
				err = _e[0],
				setErr = _e[1];
			var _s = useState(false),
				saving = _s[0],
				setSaving = _s[1];
			var _d = useState(""),
				savedAt = _d[0],
				setSavedAt = _d[1];
			var alive = useRef(0);

			var load = useCallback(
				async function () {
					var my = ++alive.current;
					setErr(null);
					try {
						await mounted;
						var r = await ctx.get("remote.research").getConfig(null);
						if (!r.ok) throw new Error(r.error.message);
						if (alive.current === my) {
							var c = r.value.config;
							setForm({
								model: c.model || "",
								thinking: c.thinking || "",
								split: c.split === true,
								researchModel: c.researchModel || "",
								researchThinking: c.researchThinking || "",
								reviewModel: c.reviewModel || "",
								reviewThinking: c.reviewThinking || "",
							});
							setWorkspaceRoute(r.value.workspaceRoute || "");
							setConfigPath(r.value.configPath || "");
						}
					} catch (e) {
						if (alive.current === my) setErr(humanizeError(String((e && e.message) || e)));
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

			var set = function (key) {
				return function (ev) {
					var v = key === "split" ? ev.target.checked : ev.target.value;
					setSavedAt("");
					setForm(function (f) {
						var g = Object.assign({}, f);
						g[key] = v;
						return g;
					});
				};
			};

			var save = useCallback(
				async function () {
					setSaving(true);
					setErr(null);
					try {
						await mounted;
						var r = await ctx.get("remote.research").setConfig({
							model: form.model.trim(),
							thinking: form.thinking,
							split: form.split,
							researchModel: form.researchModel.trim(),
							researchThinking: form.researchThinking,
							reviewModel: form.reviewModel.trim(),
							reviewThinking: form.reviewThinking,
						});
						if (!r.ok) throw new Error(r.error.message);
						setSavedAt(new Date().toLocaleTimeString());
					} catch (e) {
						setErr(String((e && e.message) || e));
					} finally {
						setSaving(false);
					}
				},
				[ctx, mounted, form],
			);

			if (!form) {
				return h("div", { className: "rsch-root" }, err ? h("div", { className: "rsch-err" }, err) : h("span", { className: "rsch-muted" }, "读取配置…"));
			}

			var modelHint = workspaceRoute
				? "留空 = 跟随工作区路由（当前生效：" + workspaceRoute + "）"
				: "留空 = 跟随工作区路由键（工作区路由暂缺位，须先在路由表或 profile 配 primary）";
			var modelPlaceholder = workspaceRoute ? workspaceRoute.split("/").slice(0, 2).join("/") : "provider/model";

			var thinkingField = function (key, hint) {
				return h(
					"div",
					{ className: "rsch-row" },
					h("span", { className: "rsch-lbl" }, "思考强度"),
					h(
						"select",
						{ className: "rsch-select", value: form[key], onChange: set(key) },
						THINKING_OPTIONS.map(function (o) {
							return h("option", { key: o.v, value: o.v }, o.l);
						}),
					),
					hint ? h("span", { className: "rsch-hint" }, hint) : null,
				);
			};
			var modelField = function (key, ph, hint) {
				return h(
					"div",
					{ className: "rsch-row" },
					h("span", { className: "rsch-lbl" }, "模型"),
					h("input", { className: "rsch-input", value: form[key], placeholder: ph, onChange: set(key), spellCheck: false }),
					hint ? h("span", { className: "rsch-hint" }, hint) : null,
				);
			};

			return h(
				"div",
				{ className: "rsch-root" },
				h(
					"div",
					{ className: "rsch-head" },
					h("b", null, "Research 调研"),
					h("span", { className: "rsch-muted" }, "research(topic) 工具的路由配置：默认一份配置，调研员与审查员两道隔离工序共用"),
				),
				h(
					"div",
					{ className: "rsch-sec" },
					h("span", { className: "rsch-sec-title" }, "默认配置（Research + Review 共用）"),
					h("div", { className: "rsch-sec-body" }, modelField("model", modelPlaceholder, modelHint), thinkingField("thinking", null)),
				),
				h(
					"div",
					{ className: "rsch-sec" },
					h(
						"div",
						{ className: "rsch-adv" },
						h("input", { type: "checkbox", id: "rsch-split", checked: form.split, onChange: set("split") }),
						h("label", { htmlFor: "rsch-split" }, "高级：Research / Review 分开配"),
					),
					form.split
						? h(
								"div",
								{ className: "rsch-split" },
								h(
									"div",
									{ className: "rsch-role" },
									h("b", null, "调研员（初稿 + 修订轮）"),
									modelField("researchModel", "跟随默认", "留空 = 跟随默认配置"),
									thinkingField("researchThinking", "留空 = 跟随默认"),
								),
								h(
									"div",
									{ className: "rsch-role" },
									h("b", null, "审查员（独立审稿）"),
									modelField("reviewModel", "跟随默认", "留空 = 跟随默认配置"),
									thinkingField("reviewThinking", "留空 = 跟随默认"),
								),
							)
						: null,
				),
				h(
					"div",
					{ className: "rsch-ft" },
					h("button", { className: "rsch-save", onClick: save, disabled: saving, "aria-disabled": saving ? "true" : "false" }, saving ? "保存中…" : "保存"),
					savedAt ? h("span", { className: "rsch-ok" }, "已保存 " + savedAt) : null,
					err ? h("span", { className: "rsch-err" }, err) : null,
				),
				h(
					"span",
					{ className: "rsch-muted" },
					"配置落 " +
						configPath +
						"；保存后对下一次 research 调用即生效（进行中的调研不受影响，无需重启 host）。模型为 provider/model 二段式，思考强度按档位透传派单链。",
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

		function apply(ctx) {
			ensureCss();
			var mounted = ctx.remote.$mount(CONTRIBUTION);
			mounted.then(null, function () {}); // 无人等待时兜底，防未处理 rejection；页内 await 仍会把错误抛给 try/catch
			// 「设置 → 插件」分区的插件配置卡（keyed slot，key 必须 === settings namespace 名——
			// 宿主 ConfigurablePluginsTab 按 served namespace ∩ 本卡求交派发，缺一隐身）。
			ctx.effect(function () {
				return ctx.slots.inject("settings.plugin.item", function () {
					return ctx.slots.register({ name: "settings.plugin.item", key: SETTINGS_NS }, function () {
						return h(ResearchSection, { ctx: ctx, mounted: mounted });
					});
				});
			}, "dsh-plugin-research: plugin card");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
