{{#each items as item}}
	<div><input type='checkbox' bind:checked='item.completed'><p>{{item.description}}</p></div>
{{/each}}

<p>{{numCompleted}} completed</p>

<script>
	export default {
		computed: {
			numCompleted ( items ) {
				return items.reduce( ( total, item ) => total + ( item.completed ? 1 : 0 ), 0 );
			}
		}
	};
</script>

