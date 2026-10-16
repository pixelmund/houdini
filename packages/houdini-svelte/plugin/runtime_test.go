package plugin_test

import (
	"context"
	"path/filepath"
	"testing"

	"code.houdinigraphql.com/packages/houdini-svelte/plugin"
	"code.houdinigraphql.com/packages/houdini-svelte/plugin/config"
	"code.houdinigraphql.com/plugins/tests"
	"github.com/spf13/afero"
	"github.com/stretchr/testify/require"
)

func TestRuntime_graphqlTag(t *testing.T) {
	tests.RunTable(t, tests.Table[config.PluginConfig, *plugin.HoudiniSvelte]{
		Schema: `type Query { hello: String }`,
		Tests: []tests.Test[config.PluginConfig]{
			{
				Name: "injects config updaters into runtime",
				Input: []string{
					`query MyQuery { hello }`,
					`query YourQuery { hello }`,
				},
			},
		},
		PerformTest: func(t *testing.T, plugin *plugin.HoudiniSvelte, test tests.Test[config.PluginConfig]) {
			config, err := plugin.DB.ProjectConfig(context.Background())
			require.Nil(t, err)

			// before we run the transform, we need to insert a plugin into the database
			conn, err := plugin.DB.Take(context.Background())
			require.Nil(t, err)
			defer plugin.DB.Put(conn)

			// prepare the .d.ts file that will be transformed
			targetPath := filepath.Join(
				config.ProjectRoot,
				config.RuntimeDir,
				"runtime",
				"index.ts",
			)
			oldContent := []byte(
				`export function graphql<_Payload, _Result = _Payload>(str: string): _Result;
`,
			)
			afero.WriteFile(plugin.Fs, targetPath, []byte(oldContent), 0644)

			// run the generator
			_, err = plugin.UpdateIndexFiles(context.Background())
			require.Nil(t, err)

			// read the transformed file
			found, err := afero.ReadFile(plugin.Fs, targetPath)
			require.NoError(t, err)

			// the injected imports land above the copied file's // @ts-nocheck pragma,
			// so UpdateIndexFiles hoists it back to the very top
			expected := `// @ts-nocheck

import type { MyQuery$document } from '$houdini/plugins/houdini-svelte/stores/MyQuery'
import type { YourQuery$document } from '$houdini/plugins/houdini-svelte/stores/YourQuery'

export function graphql(str: ` + "`" + `query MyQuery { hello }` + "`" + `): MyQuery$document;
export function graphql(str: ` + "`" + `query YourQuery { hello }` + "`" + `): YourQuery$document;
export function graphql<_Payload, _Result = _Payload>(str: string): _Result;
`
			require.Equal(t, expected, string(found))
		},
	})
}

func TestRuntime_adapterEnvModule(t *testing.T) {
	adapterFor := func(kitVersion string) tests.Table[config.PluginConfig, *plugin.HoudiniSvelte] {
		return tests.Table[config.PluginConfig, *plugin.HoudiniSvelte]{
			Schema: `type Query { hello: String }`,
			Plugin: tests.Plugin[config.PluginConfig]{
				Name:   "houdini-svelte",
				Config: config.PluginConfig{Framework: config.PluginFrameworkKit},
			},
			SetupTest: func(t *testing.T, p *plugin.HoudiniSvelte, test tests.Test[config.PluginConfig]) {
				if kitVersion == "" {
					return
				}
				projectConfig, err := p.DB.ProjectConfig(context.Background())
				require.NoError(t, err)
				pkg := filepath.Join(projectConfig.ProjectRoot, "node_modules", "@sveltejs", "kit", "package.json")
				require.NoError(t, p.Fs.MkdirAll(filepath.Dir(pkg), 0755))
				require.NoError(t, afero.WriteFile(p.Fs, pkg, []byte(`{"version": "`+kitVersion+`"}`), 0644))
			},
			PerformTest: func(t *testing.T, p *plugin.HoudiniSvelte, test tests.Test[config.PluginConfig]) {
				result, err := p.TransformRuntime(context.Background(), "adapter.ts", "")
				require.NoError(t, err)
				require.Contains(t, result, test.Extra["import"])
			},
		}
	}

	for _, test := range []struct {
		kitVersion string
		expected   string
	}{
		{kitVersion: "", expected: "from '$app/environment'"},
		{kitVersion: "2.63.0", expected: "from '$app/environment'"},
		{kitVersion: "3.1.0", expected: "from '$app/env'"},
	} {
		table := adapterFor(test.kitVersion)
		table.Tests = []tests.Test[config.PluginConfig]{
			{
				Name:  "kit " + test.kitVersion,
				Pass:  true,
				Input: []string{`query MyQuery { hello }`},
				Extra: map[string]any{"import": test.expected},
			},
		}
		tests.RunTable(t, table)
	}
}
