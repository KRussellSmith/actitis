#version 300 es
precision highp float;

in vec4 v_texcoord;

uniform sampler2D u_texture;

out vec4 outColor;

void main()
{
	
	vec2 uv = (v_texcoord.xy / v_texcoord.w) * 0.5 + 0.5;
	outColor = vec4(texture(u_texture, uv).rgb, 1.0);
	//outColor = vec4(1.0, 0.0, 0.0, 1.0);
}