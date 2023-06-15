// import nodeResolve from 'rollup-plugin-node-resolve';

export default {
	input: 'compiler/index.js',
	// moduleName: 'svelte',
	output: [{file:'dist/svelte.es.js',format:'es'},{file:'dist/svelte.umd.js',format:'umd'}],
	// plugins: [
	// 	nodeResolve({ jsnext: true, module: true })
	// ]
};
