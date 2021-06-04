#version 300 es
in vec4 a_position;
in vec2 a_texcoord;

uniform mat4 u_mvp;

out vec4 v_texcoord;

void main()
{
	gl_Position = u_mvp * a_position;
	v_texcoord = gl_Position;
}