if [ "$#" == 5 ]; then
  arg="${@:1:3} ${4}/${5}"
else
  arg="${@}"
fi

node_modules/.bin/tap --node-arg -r --node-arg @mapbox/flow-remove-types/register --node-arg -r --node-arg esm $arg --node-arg
